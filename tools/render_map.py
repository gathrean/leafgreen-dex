#!/usr/bin/env python3
"""Render the full LeafGreen world map, tile it for Leaflet, and export markers.

Usage: python3 tools/render_map.py <path-to-pret/pokefirered checkout>

Reads map layouts, tilesets, object events and wild encounters from the
decompilation, stitches every outdoor map together through its connections,
packs the interiors and dungeons underneath, and writes:
  map/tiles/{z}/{x}/{y}.webp   tile pyramid
  map/obj/*.png                overworld sprites for NPCs and obstacles
  map/markers.js               window.WORLD with markers and map rects
"""
import json
import os
import re
import sys
from collections import defaultdict, deque

import numpy as np
from PIL import Image

PFR = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "map")
MT = 16  # px per metatile
TILE = 256
BG = (36, 54, 74)
GAP = 6  # metatiles between packed interiors

NUM_TILES_PRIMARY = 640
NUM_METATILES_PRIMARY = 640
NUM_PALS_PRIMARY = 7


def p(*a):
    return os.path.join(PFR, *a)


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def load_pal(path):
    lines = read(path).split("\n")[3:19]
    return np.array([[int(v) for v in ln.split()] for ln in lines], dtype=np.uint8)


# ---------------- tilesets ----------------
headers = read(p("src/data/tilesets/headers.h"))
graphics = read(p("src/data/tilesets/graphics.h"))
metatiles_h = read(p("src/data/tilesets/metatiles.h"))
ts_info = {}
for m in re.finditer(r"const struct Tileset (gTileset_\w+) =\s*\{(.*?)\};", headers, re.S):
    body = m.group(2)
    tiles_sym = re.search(r"\.tiles = (\w+)", body).group(1)
    mt_sym = re.search(r"\.metatiles = (\w+)", body).group(1)
    mt_path = re.search(re.escape(mt_sym) + r"\[\] = INCBIN_U16\(\"([^\"]+)\"\)", metatiles_h).group(1)
    tm = re.search(re.escape(tiles_sym) + r"\[\] = INCBIN_U32\(\"([^\"]+)\"\)", graphics)
    tdir = os.path.dirname(tm.group(1)) if tm else os.path.dirname(mt_path)
    ts_info[m.group(1)] = {
        "dir": tdir,
        "tiles_png": os.path.join(tdir, "tiles.png"),
        "metatiles": mt_path,
        "attrs": mt_path.replace("metatiles.bin", "metatile_attributes.bin"),
    }

_ts_cache = {}


def tileset(name):
    if name in _ts_cache:
        return _ts_cache[name]
    info = ts_info[name]
    im = Image.open(p(info["tiles_png"]))
    arr = np.array(im, dtype=np.uint8)
    if im.mode != "P":
        raise SystemExit("unexpected tiles mode " + info["tiles_png"])
    h, w = arr.shape
    tiles = arr.reshape(h // 8, 8, w // 8, 8).transpose(0, 2, 1, 3).reshape(-1, 8, 8)
    pals = []
    for i in range(16):
        f = p(info["dir"], "palettes", "%02d.pal" % i)
        pals.append(load_pal(f) if os.path.exists(f) else np.zeros((16, 3), np.uint8))
    mts = np.fromfile(p(info["metatiles"]), dtype="<u2").reshape(-1, 8)
    attrs = np.fromfile(p(info["attrs"]), dtype="<u4")
    _ts_cache[name] = (tiles, np.array(pals), mts, attrs)
    return _ts_cache[name]


_mt_cache = {}


def metatile(prim, sec, mid):
    key = (prim, sec, mid)
    if key in _mt_cache:
        return _mt_cache[key]
    P = tileset(prim)
    S = tileset(sec)
    src = P if mid < NUM_METATILES_PRIMARY else S
    idx = mid if mid < NUM_METATILES_PRIMARY else mid - NUM_METATILES_PRIMARY
    out = np.zeros((16, 16, 3), np.uint8)
    enc = 0
    if idx < len(src[2]):
        entries = src[2][idx]
        enc = int((src[3][idx] >> 24) & 7) if idx < len(src[3]) else 0
        for layer in range(2):
            for q in range(4):
                e = int(entries[layer * 4 + q])
                t = e & 0x3FF
                hf, vf, pal = (e >> 10) & 1, (e >> 11) & 1, (e >> 12) & 0xF
                tiles = P[0] if t < NUM_TILES_PRIMARY else S[0]
                ti = t if t < NUM_TILES_PRIMARY else t - NUM_TILES_PRIMARY
                if ti >= len(tiles):
                    continue
                px = tiles[ti]
                if hf:
                    px = px[:, ::-1]
                if vf:
                    px = px[::-1, :]
                palette = (P[1] if pal < NUM_PALS_PRIMARY else S[1])[pal]
                rgb = palette[px]
                oy, ox = (q // 2) * 8, (q % 2) * 8
                if layer == 0:
                    out[oy:oy + 8, ox:ox + 8] = rgb
                else:
                    mask = px != 0
                    region = out[oy:oy + 8, ox:ox + 8]
                    region[mask] = rgb[mask]
    _mt_cache[key] = (out, enc)
    return _mt_cache[key]


# ---------------- maps ----------------
layouts = {l["id"]: l for l in json.load(open(p("data/layouts/layouts.json")))["layouts"] if "id" in l}
maps = {}
for d in sorted(os.listdir(p("data/maps"))):
    f = p("data/maps", d, "map.json")
    if os.path.exists(f):
        m = json.load(open(f))
        m["dir"] = d
        maps[m["id"]] = m

SKIP = re.compile(r"Prototype|BattleColosseum|TradeCenter|RecordCorner|UnionRoom|BirthIsland|NavelRock|^MAP_UNUSED|Unused|SeviiIsle_?Unused|CeruleanCity_Unused|^MAP_NAVEL|DesertUnderpass|^MAP_ROUTE\d+_UNUSED")


def render(m):
    lay = layouts[m["layout"]]
    w, h = lay["width"], lay["height"]
    blocks = np.fromfile(p(lay["blockdata_filepath"]), dtype="<u2")[: w * h].reshape(h, w)
    img = np.zeros((h * MT, w * MT, 3), np.uint8)
    enc = np.zeros((h, w), np.uint8)
    for y in range(h):
        for x in range(w):
            tile, e = metatile(lay["primary_tileset"], lay["secondary_tileset"], int(blocks[y, x]) & 0x3FF)
            img[y * MT:(y + 1) * MT, x * MT:(x + 1) * MT] = tile
            enc[y, x] = e
    return img, enc, w, h


def size(mid):
    lay = layouts[maps[mid]["layout"]]
    return lay["width"], lay["height"]


# ---------------- stitch outdoor components ----------------
outdoor = {k for k, m in maps.items() if (m.get("connections") or m["map_type"] in ("MAP_TYPE_TOWN", "MAP_TYPE_CITY")) and not SKIP.search(m["dir"]) and not SKIP.search(k)}
pos = {}
components = []
for start in ["MAP_PALLET_TOWN"] + sorted(outdoor):
    if start in pos or start not in outdoor:
        continue
    comp = [start]
    pos[start] = (0, 0)
    q = deque([start])
    while q:
        cur = q.popleft()
        cx, cy = pos[cur]
        cw, ch = size(cur)
        for c in maps[cur].get("connections") or []:
            n = c["map"]
            if n not in maps or n in pos or n not in outdoor:
                continue
            nw, nh = size(n)
            off = int(c["offset"])
            d = c["direction"]
            if d == "up":
                pos[n] = (cx + off, cy - nh)
            elif d == "down":
                pos[n] = (cx + off, cy + ch)
            elif d == "left":
                pos[n] = (cx - nw, cy + off)
            elif d == "right":
                pos[n] = (cx + cw, cy + off)
            else:
                continue
            comp.append(n)
            q.append(n)
    components.append(comp)


def bbox(comp):
    xs = [pos[m][0] for m in comp] + [pos[m][0] + size(m)[0] for m in comp]
    ys = [pos[m][1] for m in comp] + [pos[m][1] + size(m)[1] for m in comp]
    return min(xs), min(ys), max(xs), max(ys)


world = {}  # map id -> (x, y) in metatiles on the final canvas
kanto = components[0]
kx0, ky0, kx1, ky1 = bbox(kanto)
for m in kanto:
    world[m] = (pos[m][0] - kx0 + GAP, pos[m][1] - ky0 + GAP)
canvas_w = kx1 - kx0 + GAP * 2
cursor_y = ky1 - ky0 + GAP * 2

# Sevii (and any other outdoor islands): one shelf under Kanto, ordered by island number
order = ["ONE_ISLAND", "TWO_ISLAND", "THREE_ISLAND", "FOUR_ISLAND", "FIVE_ISLAND", "SIX_ISLAND", "SEVEN_ISLAND"]


def comp_rank(comp):
    for i, k in enumerate(order):
        if any(k in m for m in comp):
            return i
    return 99


rest = sorted(components[1:], key=comp_rank)


def shelf_pack(items, start_y, width):
    """items: list of (key, w, h). Returns {key: (x, y)}, end_y."""
    out = {}
    x, y, row_h = GAP, start_y, 0
    for key, w, h in items:
        if x + w + GAP > width and x > GAP:
            x, y, row_h = GAP, y + row_h + GAP, 0
        out[key] = (x, y)
        x += w + GAP
        row_h = max(row_h, h)
    return out, y + row_h + GAP


blocks = []
for comp in rest:
    x0, y0, x1, y1 = bbox(comp)
    blocks.append((tuple(comp), x1 - x0, y1 - y0, x0, y0))
placed, cursor_y = shelf_pack([(b[0], b[1], b[2]) for b in blocks], cursor_y, canvas_w)
for comp, w, h, x0, y0 in blocks:
    bx, by = placed[comp]
    for m in comp:
        world[m] = (pos[m][0] - x0 + bx, pos[m][1] - y0 + by)

# Interiors: buildings and dungeons sit next to their own entrance, floors stacked
# top floor first, the way a printed strategy-guide map lays them out.
interiors = [k for k, m in maps.items() if k not in world and not SKIP.search(m["dir"]) and not SKIP.search(k) and m["layout"] in layouts]
interior_set = set(interiors)
parent = {k: k for k in interiors}


def find(k):
    while parent[k] != k:
        parent[k] = parent[parent[k]]
        k = parent[k]
    return k


def union(a, b):
    ra, rb = find(a), find(b)
    if ra != rb:
        parent[rb] = ra


FLOOR_RE = re.compile(r"_(B?\d+F|Roof|Rooftop|RoofRoom|Elevator|Lobby|Basement)$")


def stem(d):
    return FLOOR_RE.sub("", d)


for k in interiors:
    for w in maps[k].get("warp_events") or []:
        if w["dest_map"] in interior_set:
            union(k, w["dest_map"])
by_stem = defaultdict(list)
for k in interiors:
    by_stem[stem(maps[k]["dir"])].append(k)
for ks in by_stem.values():
    for k in ks[1:]:
        union(ks[0], k)
groups = defaultdict(list)
for k in interiors:
    groups[find(k)].append(k)


def floor_rank(d):
    m = re.search(r"_(B?)(\d+)F$", d)
    if m:
        return -int(m.group(2)) if m.group(1) else int(m.group(2))
    if re.search(r"Roof", d):
        return 50
    return 0


def natural(s):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", s)]


def layout_group(ks):
    """Stack a group's maps: highest floor on top. Wraps into columns when tall."""
    ks = sorted(ks, key=lambda k: (-floor_rank(maps[k]["dir"]), natural(maps[k]["dir"])))
    widest = max(size(k)[0] for k in ks)
    total_h = sum(size(k)[1] + 1 for k in ks)
    limit = max(widest, int((sum((size(k)[0] + 1) * (size(k)[1] + 1) for k in ks)) ** 0.5 * 1.2))
    if total_h <= 70:
        limit = widest  # a single column reads best for short stacks
    out, x, y, row_h = {}, 0, 0, 0
    for k in ks:
        w, h = size(k)
        if x + w > limit and x > 0:
            x, y, row_h = 0, y + row_h + 1, 0
        out[k] = (x, y)
        x += w + 1
        row_h = max(row_h, h)
    gw = max(x + size(k)[0] for k, (x, _) in out.items())
    gh = max(y + size(k)[1] for k, (_, y) in out.items())
    return out, gw, gh


def entrance(ks):
    pts = []
    for k in ks:
        for w in maps[k].get("warp_events") or []:
            dm = w["dest_map"]
            if dm in world:
                di = int(w["dest_warp_id"]) if str(w["dest_warp_id"]).isdigit() else 0
                dw = (maps[dm].get("warp_events") or [{"x": 0, "y": 0}])
                dw = dw[di] if di < len(dw) else dw[0]
                pts.append((world[dm][0] + dw["x"], world[dm][1] + dw["y"]))
    if not pts:
        # some caves are only linked from the outside door, so look the other way too
        kset = set(ks)
        for om, (wx, wy) in world.items():
            for w in maps[om].get("warp_events") or []:
                if w["dest_map"] in kset:
                    pts.append((wx + w["x"], wy + w["y"]))
    if not pts:
        return None
    return min(pts, key=lambda p: (p[1], p[0]))


# occupancy grid over the outdoor world plus a border to grow into
R = 110
ox0 = min(x for x, _ in world.values()) - R
oy0 = min(y for _, y in world.values()) - R
ox1 = max(world[k][0] + size(k)[0] for k in world) + R
oy1 = max(world[k][1] + size(k)[1] for k in world) + R
GW, GH = ox1 - ox0, oy1 - oy0
occ = np.zeros((GH, GW), np.int32)
for k, (x, y) in world.items():
    w, h = size(k)
    occ[max(0, y - oy0 - 2):y - oy0 + h + 2, max(0, x - ox0 - 2):x - ox0 + w + 2] = 1
yy, xx = np.mgrid[0:GH, 0:GW]

order = []
for g, ks in groups.items():
    lay, gw, gh = layout_group(ks)
    order.append((g, ks, lay, gw, gh, entrance(ks)))
order.sort(key=lambda t: -(t[3] * t[4]))
unplaced = []
group_box = {}
for g, ks, lay, gw, gh, ent in order:
    if ent is None:
        print("  no entrance:", maps[g]["dir"], len(ks), file=sys.stderr)
        unplaced.append((g, ks, lay, gw, gh))
        continue
    pw, ph = gw + 2, gh + 2  # one-tile margin
    sat = np.pad(occ, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    vh, vw = GH - ph + 1, GW - pw + 1
    if vh <= 0 or vw <= 0:
        unplaced.append((g, ks, lay, gw, gh))
        continue
    filled = sat[ph:ph + vh, pw:pw + vw] - sat[0:vh, pw:pw + vw] - sat[ph:ph + vh, 0:vw] + sat[0:vh, 0:vw]
    ex, ey = ent[0] - ox0, ent[1] - oy0
    X, Y = xx[:vh, :vw], yy[:vh, :vw]
    dx = np.maximum(0, np.maximum(X - ex, ex - (X + pw)))
    dy = np.maximum(0, np.maximum(Y - ey, ey - (Y + ph)))
    cost = (dx * dx + dy * dy) + 0.02 * ((X + pw / 2 - ex) ** 2 + (Y + ph / 2 - ey) ** 2)
    cost = np.where(filled == 0, cost, np.inf)
    i = int(np.argmin(cost))
    if not np.isfinite(cost.flat[i]) or cost.flat[i] > 140 ** 2:
        print("  side:", maps[g]["dir"], gw, gh, "best", cost.flat[i] if np.isfinite(cost.flat[i]) else "none", file=sys.stderr)
        unplaced.append((g, ks, lay, gw, gh))
        continue
    py, px = divmod(i, vw)
    gx, gy = px + ox0 + 1, py + oy0 + 1
    for k, (lx, ly) in lay.items():
        world[k] = (gx + lx, gy + ly)
    group_box[g] = (gx, gy, gw, gh)
    occ[py:py + ph, px:px + pw] = 1

# anything without an outdoor entrance (or no room nearby) goes on a shelf to the right
xs_max = max(world[k][0] + size(k)[0] for k in world)
ys_min = min(y for _, y in world.values())
items = []
for g, ks, lay, gw, gh in unplaced:
    items.append((g, gw, gh))
cx, cy, row_h = xs_max + GAP * 2, ys_min, 0
col_w = 120
for g, ks, lay, gw, gh in unplaced:
    if cx + gw > xs_max + GAP * 2 + col_w and cx > xs_max + GAP * 2:
        cx, cy, row_h = xs_max + GAP * 2, cy + row_h + GAP, 0
    for k, (lx, ly) in lay.items():
        world[k] = (cx + lx, cy + ly)
    group_box[g] = (cx, cy, gw, gh)
    cx += gw + GAP
    row_h = max(row_h, gh)

# normalise to a positive canvas
mx = min(x for x, _ in world.values()) - GAP
my = min(y for _, y in world.values()) - GAP
world = {k: (x - mx, y - my) for k, (x, y) in world.items()}
group_box = {g: (x - mx, y - my, w, h) for g, (x, y, w, h) in group_box.items()}
canvas_w = max(world[k][0] + size(k)[0] for k in world) + GAP
canvas_h = max(world[k][1] + size(k)[1] for k in world) + GAP
group_of = {k: find(k) for k in interiors}
print("canvas %dx%d metatiles (%dx%d px), %d maps, %d groups near entrances, %d on the side" % (
    canvas_w, canvas_h, canvas_w * MT, canvas_h * MT, len(world), len(groups) - len(unplaced), len(unplaced)), file=sys.stderr)


def px_bbox(keys):
    xs0 = [world[k][0] for k in keys]; ys0 = [world[k][1] for k in keys]
    xs1 = [world[k][0] + size(k)[0] for k in keys]; ys1 = [world[k][1] + size(k)[1] for k in keys]
    return [min(xs0) * MT, min(ys0) * MT, max(xs1) * MT, max(ys1) * MT]


regions = {"kanto": px_bbox(kanto), "sevii": px_bbox([m for c in rest for m in c]), "inside": px_bbox(interiors)}

# ---------------- render canvas ----------------
W, H = canvas_w * MT, canvas_h * MT
canvas = np.empty((H, W, 3), np.uint8)
canvas[:] = BG
enc_maps = {}
for k, (x, y) in world.items():
    img, enc, w, h = render(maps[k])
    canvas[y * MT:y * MT + img.shape[0], x * MT:x * MT + img.shape[1]] = img
    enc_maps[k] = enc

# ---------------- tile pyramid ----------------
import hashlib
ver = hashlib.sha1(canvas.tobytes()[:: 997]).hexdigest()[:10]  # changes whenever the picture does
tdir = os.path.join(OUT, "tiles")
max_z = 0
while (max(W, H) / (2 ** max_z)) > 512:
    max_z += 1
# zoom max_z = native pixels; zoom 0 = whole map fits ~512px
im = Image.fromarray(canvas)
saved = []
for z in range(max_z, -1, -1):
    scale = 2 ** (max_z - z)
    lvl = im if scale == 1 else im.resize((max(1, W // scale), max(1, H // scale)), Image.BOX)
    lw, lh = lvl.size
    for tx in range(0, (lw + TILE - 1) // TILE):
        for ty in range(0, (lh + TILE - 1) // TILE):
            crop = Image.new("RGB", (TILE, TILE), BG)
            crop.paste(lvl.crop((tx * TILE, ty * TILE, min(lw, tx * TILE + TILE), min(lh, ty * TILE + TILE))), (0, 0))
            a = np.asarray(crop)
            if (a == np.array(BG, np.uint8)).all():
                continue
            d = os.path.join(tdir, str(z), str(tx))
            os.makedirs(d, exist_ok=True)
            crop.save(os.path.join(d, "%d.webp" % ty), "WEBP", lossless=True, quality=100, method=4)
            saved.append("%d/%d/%d" % (z, tx, ty))
    print("zoom", z, lvl.size, file=sys.stderr)

# ---------------- object sprites ----------------
ptrs = read(p("src/data/object_events/object_event_graphics_info_pointers.h"))
infos = read(p("src/data/object_events/object_event_graphics_info.h"))
pics = read(p("src/data/object_events/object_event_pic_tables.h"))
gfx_h = read(p("src/data/object_events/object_event_graphics.h"))
mov_c = read(p("src/event_object_movement.c"))
gfx_to_info = dict(re.findall(r"\[(OBJ_EVENT_GFX_\w+)\]\s*=\s*&(\w+)", ptrs))
tag_to_pal = {}
for sym, tag in re.findall(r"\{(gObjectEventPal_\w+),\s*(OBJ_EVENT_PAL_TAG_\w+)\}", mov_c):
    mm = re.search(re.escape(sym) + r"\[\] = INCBIN_U16\(\"([^\"]+)\"\)", gfx_h)
    if mm:
        tag_to_pal[tag] = mm.group(1).replace(".gbapal", ".pal")

odir = os.path.join(OUT, "obj")
os.makedirs(odir, exist_ok=True)
sprite_ok = {}


def sprite(gfx):
    if gfx in sprite_ok:
        return sprite_ok[gfx]
    sprite_ok[gfx] = None
    info_sym = gfx_to_info.get(gfx)
    if not info_sym:
        return None
    body = re.search(r"const struct ObjectEventGraphicsInfo " + re.escape(info_sym) + r" = \{(.*?)\};", infos, re.S)
    if not body:
        return None
    body = body.group(1)
    w = int(re.search(r"\.width = (\d+)", body).group(1))
    h = int(re.search(r"\.height = (\d+)", body).group(1))
    tag = re.search(r"\.paletteTag = (\w+)", body).group(1)
    table = re.search(r"\.images = (\w+)", body).group(1)
    tb = re.search(re.escape(table) + r"\[\] = \{(.*?)\};", pics, re.S)
    if not tb:
        return None
    pic_sym = re.search(r"\((gObjectEventPic_\w+)", tb.group(1)).group(1)
    pm = re.search(re.escape(pic_sym) + r"\[\] = INCBIN_U(?:16|32)\(\"([^\"]+)\"\)", gfx_h)
    if not pm:
        return None
    png = p(re.sub(r"\.4bpp(\.lz)?$", ".png", pm.group(1)))
    if not os.path.exists(png):
        return None
    src = Image.open(png)
    if src.mode != "P":
        return None
    idx = np.array(src)
    if idx.shape[1] < w or idx.shape[0] < h:
        w, h = idx.shape[1], idx.shape[0]
    frame = idx[:h, :w]
    pal_path = tag_to_pal.get(tag)
    if pal_path and os.path.exists(p(pal_path)):
        pal = load_pal(p(pal_path))
    else:
        raw = src.getpalette()[:48]
        pal = np.array(raw, np.uint8).reshape(16, 3)
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., :3] = pal[frame % 16]
    rgba[..., 3] = np.where(frame == 0, 0, 255)
    name = gfx.replace("OBJ_EVENT_GFX_", "").lower()
    Image.fromarray(rgba, "RGBA").save(os.path.join(odir, name + ".png"))
    sprite_ok[gfx] = (name, w, h)
    return sprite_ok[gfx]


# ---------------- markers ----------------
item_scripts = {}
for f in os.listdir(p("data/scripts")):
    if f.endswith(".inc"):
        for lab, item in re.findall(r"^(\w+)::\s*\n\s*finditem (ITEM_\w+)", read(p("data/scripts", f)), re.M):
            item_scripts[lab] = item
for k in world:
    s = p("data/maps", maps[k]["dir"], "scripts.inc")
    if os.path.exists(s):
        for lab, item in re.findall(r"^(\w+)::\s*\n\s*finditem (ITEM_\w+)", read(s), re.M):
            item_scripts[lab] = item


def pretty_item(c):
    c = c.replace("ITEM_", "")
    if re.match(r"(TM|HM)\d+", c):
        return c[:4]
    return c.replace("_", " ").title().replace("Pp ", "PP ").replace("Hp ", "HP ")


def item_slug(c):
    c = c.replace("ITEM_", "").lower()
    m = re.match(r"(tm|hm)(\d+)", c)
    if m:
        return None
    return c.replace("_", "-")


def pretty_map(d):
    s = d.replace("_", " ")
    s = re.sub(r"(?<=[a-z])(?=[A-Z0-9])", " ", s)
    s = re.sub(r"(?<=[0-9])(?=[A-Z][a-z])", " ", s)
    s = re.sub(r"\b(\d+)\s+F\b", r"\1F", s).replace("B 1 F", "B1F")
    s = s.replace("Mt Moon", "Mt. Moon").replace("Mt Ember", "Mt. Ember").replace("S S Anne", "S.S. Anne").replace("Pokemon", "Pokémon")
    s = s.replace("Poke Mart", "Poké Mart").replace("Pokemon Center", "Pokémon Center")
    return re.sub(r"\s+", " ", s).strip()


species_ids = {}
dex_h = read(p("include/constants/pokedex.h"))
natl = dex_h[dex_h.index("enum {"):dex_h.index("};")]
for i, name in enumerate(re.findall(r"NATIONAL_DEX_(\w+)", natl)):
    species_ids["SPECIES_" + name] = i


def species_num(s):
    return species_ids.get(s)


# ---------------- trainers ----------------
trainer_of_script = {}
script_files = [p("data/scripts", f) for f in os.listdir(p("data/scripts")) if f.endswith(".inc")]
script_files += [p("data/maps", d, "scripts.inc") for d in os.listdir(p("data/maps")) if os.path.exists(p("data/maps", d, "scripts.inc"))]
for sf in script_files:
    for block in re.split(r"\n(?=\w+::)", read(sf)):
        mm = re.match(r"(\w+)::", block)
        tb = re.search(r"trainerbattle\w*\s+(TRAINER_\w+)", block)
        if mm and tb:
            trainer_of_script[mm.group(1)] = tb.group(1)
trainers_h = read(p("src/data/trainers.h"))
parties_h = read(p("src/data/trainer_parties.h"))
parties = {}
for name, body in re.findall(r"(sParty_\w+)\[\] = \{(.*?)\n\};", parties_h, re.S):
    parties[name] = [(species_ids.get(sp), int(lv)) for lv, sp in re.findall(r"\.lvl = (\d+),.*?\.species = (SPECIES_\w+)", body, re.S)]
trainer_info = {}
for tid, body in re.findall(r"\[(TRAINER_\w+)\] = \{(.*?)\n    \},", trainers_h, re.S):
    cls = re.search(r"\.trainerClass = TRAINER_CLASS_(\w+)", body)
    nm = re.search(r'\.trainerName = _\("([^"]*)"\)', body)
    pt = re.search(r"\((sParty_\w+)\)", body)
    trainer_info[tid] = {
        "cls": cls.group(1).replace("_", " ").title().replace("Pkmn", "Pokémon").replace("Pokemon", "Pokémon") if cls else "",
        "name": nm.group(1).title() if nm else "",
        "party": parties.get(pt.group(1), []) if pt else [],
    }
print("trainers parsed", len(trainer_info), "scripts", len(trainer_of_script), file=sys.stderr)

OBSTACLE = {"CUT_TREE": "Cut tree", "PUSHABLE_BOULDER": "Strength boulder", "ROCK_SMASH_ROCK": "Rock Smash rock"}
SPECIAL_GFX = {"FOSSIL", "OLD_AMBER", "ZAPDOS", "ARTICUNO", "MOLTRES", "MEWTWO", "LUGIA", "HO_OH", "SNORLAX", "RUBY", "SAPPHIRE"}
SPECIAL_DEX = {"Bulbasaur": 1, "Charmander": 4, "Squirtle": 7, "Hitmonlee": 106, "Hitmonchan": 107, "Eevee": 133, "Electrode": 101,
               "Dome Fossil": 140, "Helix Fossil": 138, "Old Amber": 142, "Articuno": 144, "Zapdos": 145, "Moltres": 146,
               "Mewtwo": 150, "Lugia": 249, "Ho Oh": 250, "Snorlax": 143}


def special_label(script, short):
    tail = script.split("EventScript_")[-1] if script and "EventScript_" in script else short.title()
    tail = re.sub(r"Ball$|\d+$", "", tail)
    return re.sub(r"(?<=[a-z])(?=[A-Z])", " ", tail).replace("_", " ").strip()


markers = {"specials": [], "items": [], "hidden": [], "obstacles": [], "npcs": [], "trainers": [], "warps": [], "labels": [], "mons": [], "maps": []}

# wild encounters (LeafGreen tables)
wild = json.load(open(p("src/data/wild_encounters.json")))["wild_encounter_groups"][0]
rates = {}
for fdef in wild["fields"]:
    rates[fdef["type"]] = fdef["encounter_rates"]
    if "groups" in fdef:
        rates["fishing_groups"] = fdef["groups"]
def table(mons, rate_list):
    agg = {}
    for i, mon in enumerate(mons):
        k = mon["species"]
        a = agg.setdefault(k, [0, 999, 0])
        a[0] += rate_list[i]
        a[1] = min(a[1], mon["min_level"])
        a[2] = max(a[2], mon["max_level"])
    return sorted(([k, *v] for k, v in agg.items()), key=lambda r: -r[1])


wild_by_map = {}
for e in wild["encounters"]:
    if not e["base_label"].endswith("_LeafGreen"):
        continue
    t = {}
    if "land_mons" in e:
        t["land"] = table(e["land_mons"]["mons"], rates["land_mons"])
    if "water_mons" in e:
        t["surf"] = table(e["water_mons"]["mons"], rates["water_mons"])
    if "rock_smash_mons" in e:
        t["rock"] = table(e["rock_smash_mons"]["mons"], rates["rock_smash_mons"])
    if "fishing_mons" in e:
        fm = e["fishing_mons"]["mons"]
        fr = rates["fishing_mons"]
        g = rates.get("fishing_groups", {"old_rod": [0, 1], "good_rod": [2, 3, 4], "super_rod": [5, 6, 7, 8, 9]})
        for rod, idxs in g.items():
            sub = [fm[i] for i in idxs]
            tot = sum(fr[i] for i in idxs)
            t[rod] = table(sub, [round(fr[i] * 100 / tot) for i in idxs])
    wild_by_map[e["map"]] = t


def anchor(enc, want):
    ys, xs = np.nonzero(enc == want)
    if not len(xs):
        return None
    cx, cy = xs.mean(), ys.mean()
    i = int(np.argmin((xs - cx) ** 2 + (ys - cy) ** 2))
    return int(xs[i]), int(ys[i])


warp_index = {}
for k, (mx, my) in world.items():
    for i, w in enumerate(maps[k].get("warp_events") or []):
        warp_index[(k, i)] = ((mx + w["x"]) * MT + 8, (my + w["y"]) * MT + 8)

def group_title(g):
    names = [pretty_map(maps[k]["dir"]) for k in groups[g]]
    pre = os.path.commonprefix(names)
    pre = pre[: pre.rfind(" ")] if not all(n == pre for n in names) and " " in pre else pre
    return pre.strip() or names[0]


for g, (gx, gy, gw, gh) in group_box.items():
    if len(groups[g]) > 1:
        markers["labels"].append([group_title(g), (gx + gw / 2) * MT, gy * MT - 10, 3])

sp_names = {}
for k, (mx, my) in world.items():
    m = maps[k]
    w, h = size(k)
    name = pretty_map(m["dir"])
    markers["maps"].append([k, name, mx * MT, my * MT, w * MT, h * MT, 1 if k in outdoor else 0])
    if k in group_of and len(groups[group_of[k]]) > 1:
        title = group_title(group_of[k])
        short = name[len(title):].strip() if name.startswith(title) else name
        markers["labels"].append([short or name, (mx + w / 2) * MT, (my + h / 2) * MT, 2])
    else:
        markers["labels"].append([name, (mx + w / 2) * MT, (my + h / 2) * MT, 1 if k in outdoor else 0])
    for o in m.get("object_events") or []:
        if o.get("type") == "clone" or "x" not in o:
            continue
        x, y = (mx + o["x"]) * MT + 8, (my + o["y"]) * MT + 8
        g = o.get("graphics_id", "")
        short = g.replace("OBJ_EVENT_GFX_", "")
        script = o.get("script", "")
        if (short in SPECIAL_GFX and script not in ("0x0", "")) or (short == "ITEM_BALL" and script not in item_scripts):
            label = special_label(script, short)
            spr = sprite(g)
            markers["specials"].append([x, y, label, spr[0] if spr else None, name, SPECIAL_DEX.get(label)])
        elif short == "ITEM_BALL":
            item = item_scripts.get(o.get("script", ""))
            markers["items"].append([x, y, pretty_item(item) if item else "Item", item_slug(item) if item else None, name])
        elif short in OBSTACLE:
            spr = sprite(g)
            markers["obstacles"].append([x, y, OBSTACLE[short], spr[0] if spr else None, name])
        else:
            spr = sprite(g)
            tid = trainer_of_script.get(script)
            label = short.replace("_", " ").title()
            if tid and tid in trainer_info:
                ti = trainer_info[tid]
                leader = 1 if re.search(r"LEADER|ELITE|CHAMPION", tid) else 0
                markers["trainers"].append([x, y, (ti["cls"] + " " + ti["name"]).strip() or label, spr[0] if spr else None, name, [[d, lv] for d, lv in ti["party"] if d], leader])
            else:
                markers["npcs"].append([x, y, label, spr[0] if spr else None, name])
    for b in m.get("bg_events") or []:
        if b.get("type") == "hidden_item" and b.get("item") not in (None, "ITEM_NONE"):
            x, y = (mx + b["x"]) * MT + 8, (my + b["y"]) * MT + 8
            markers["hidden"].append([x, y, pretty_item(b["item"]), item_slug(b["item"]), name])
    for i, wv in enumerate(m.get("warp_events") or []):
        x, y = (mx + wv["x"]) * MT + 8, (my + wv["y"]) * MT + 8
        dest = wv["dest_map"]
        tgt = warp_index.get((dest, int(wv["dest_warp_id"]))) if str(wv["dest_warp_id"]).isdigit() else None
        if dest in maps and dest in world:
            markers["warps"].append([x, y, pretty_map(maps[dest]["dir"]), tgt[0] if tgt else None, tgt[1] if tgt else None, name])
    t = wild_by_map.get(k)
    if t:
        enc = enc_maps[k]
        land = anchor(enc, 1)
        water = anchor(enc, 2)
        cx, cy = mx + w // 2, my + h // 2
        for kind, tbl in t.items():
            if kind == "land":
                a = land or (w // 2, h // 2)
            else:
                a = water or land or (w // 2, h // 2)
            ax, ay = (mx + a[0]) * MT + 8, (my + a[1]) * MT + 8
            rows = []
            for s, pct, lo, hi in tbl:
                num = species_num(s)
                rows.append([num, s.replace("SPECIES_", "").replace("_", " ").title(), pct, lo, hi])
            markers["mons"].append([ax, ay, kind, rows, name])

# remove duplicated labels for multi-part outdoor maps is unnecessary; keep all
with open(os.path.join(OUT, "markers.js"), "w", encoding="utf-8") as f:
    f.write("// Generated by tools/render_map.py from pret/pokefirered.\n")
    f.write("window.WORLD=" + json.dumps({"w": W, "h": H, "maxZoom": max_z, "tile": TILE, "bg": "#%02x%02x%02x" % BG, "tiles": " ".join(saved), "ver": ver, "regions": regions, **markers}, separators=(",", ":")) + ";\n")
print({k: len(v) for k, v in markers.items()}, file=sys.stderr)
