#!/usr/bin/env python3
"""Build data.js for the LeafGreen checklist from PokeAPI CSVs.

Usage: python3 tools/build_data.py <pokeapi-csv-dir> [guide.json]

CSVs come from https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv.
guide.json holds the hand-written route order, unlocks and notes.
"""
import csv
import json
import os
import sys
from collections import defaultdict

CSV = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUIDE = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "tools", "guide.json")
LEAFGREEN = "11"
MAX_DEX = 386


def rows(name):
    with open(os.path.join(CSV, name + ".csv"), newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


guide = json.load(open(GUIDE, encoding="utf-8"))

# ---------- species ----------
names = {r["pokemon_species_id"]: r["name"] for r in rows("pokemon_species_names") if r["local_language_id"] == "9"}
types = {r["id"]: r["identifier"] for r in rows("types")}
cur_types = defaultdict(list)
for r in rows("pokemon_types"):
    cur_types[r["pokemon_id"]].append((int(r["slot"]), types[r["type_id"]]))
past = defaultdict(dict)
for r in rows("pokemon_types_past"):
    past[r["pokemon_id"]].setdefault(int(r["generation_id"]), []).append((int(r["slot"]), types[r["type_id"]]))


def gen3_types(pid):
    # A past entry with generation_id g means "these were the types up to gen g".
    gens = sorted(g for g in past.get(pid, {}) if g >= 3)
    t = past[pid][gens[0]] if gens else cur_types[pid]
    return [x for _, x in sorted(t)]


items = {r["id"]: r["identifier"] for r in rows("items")}
evo = {}
for r in rows("pokemon_evolution"):
    sid = int(r["evolved_species_id"])
    if sid > MAX_DEX or sid in evo:
        continue
    trig = r["evolution_trigger_id"]
    if trig == "1":
        if r["minimum_level"]:
            how = "Lv. " + r["minimum_level"]
        elif r["minimum_happiness"]:
            how = "High friendship"
        elif r["minimum_beauty"]:
            how = "High Beauty"
        elif r["relative_physical_stats"]:
            how = {"1": "Lv. 20, Atk > Def", "-1": "Lv. 20, Atk < Def", "0": "Lv. 20, Atk = Def"}[r["relative_physical_stats"]]
        else:
            how = "Level up"
        if r["time_of_day"]:
            how += " (" + r["time_of_day"] + ")"
    elif trig == "2":
        how = "Trade"
        if r["held_item_id"]:
            how += " holding " + items[r["held_item_id"]].replace("-", " ").title()
    elif trig == "3":
        how = items[r["trigger_item_id"]].replace("-", " ").title()
    else:
        how = "Special"
    evo[sid] = how

species = {}
for r in rows("pokemon_species"):
    sid = int(r["id"])
    if sid > MAX_DEX:
        continue
    species[sid] = {
        "n": names[r["id"]],
        "t": gen3_types(r["id"]),
        "c": int(r["capture_rate"]),
        "f": int(r["evolves_from_species_id"]) if r["evolves_from_species_id"] else None,
        "e": evo.get(sid),
        "g": int(r["generation_id"]),
        "L": 1 if r["is_legendary"] == "1" or r["is_mythical"] == "1" else 0,
    }

# ---------- encounters ----------
slots = {r["id"]: r for r in rows("encounter_slots")}
methods = {r["id"]: r["identifier"] for r in rows("encounter_methods")}
areas = {r["id"]: r for r in rows("location_areas")}
locs = {r["id"]: r["identifier"] for r in rows("locations")}
poke_species = {r["id"]: int(r["species_id"]) for r in rows("pokemon")}
cond_vals = {r["id"]: r["identifier"] for r in rows("encounter_condition_values")}
enc = [r for r in rows("encounters") if r["version_id"] == LEAFGREEN]
enc_ids = {r["id"] for r in enc}
conds = defaultdict(list)
for r in rows("encounter_condition_value_map"):
    if r["encounter_id"] in enc_ids:
        conds[r["encounter_id"]].append(cond_vals[r["encounter_condition_value_id"]])

# area key -> method -> species -> [pct, min, max, cond]
tables = defaultdict(lambda: defaultdict(dict))
for e in enc:
    a = areas[e["location_area_id"]]
    key = locs[a["location_id"]] + ("/" + a["identifier"] if a["identifier"] else "")
    s = slots[e["encounter_slot_id"]]
    m = methods[s["encounter_method_id"]]
    sid = poke_species[e["pokemon_id"]]
    c = ",".join(conds[e["id"]])
    d = tables[key][m].setdefault(sid, [0, 999, 0, c])
    d[0] += int(s["rarity"] or 0)
    d[1] = min(d[1], int(e["min_level"]))
    d[2] = max(d[2], int(e["max_level"]))

METHOD_ORDER = ["walk", "surf", "old-rod", "good-rod", "super-rod", "rock-smash", "pokeflute", "static", "gift", "gift-egg", "npc-trade", "roaming-grass"]
used_keys = set()
locations = []
for g in guide["locations"]:
    floors = []
    for fl in g.get("areas") if "areas" in g else [{"keys": [g["id"]]}]:
        merged = defaultdict(dict)
        for k in fl["keys"]:
            if k not in tables:
                raise SystemExit("unknown area key " + k)
            used_keys.add(k)
            for m, mons in tables[k].items():
                for sid, d in mons.items():
                    merged[m][sid] = list(d)
        tabs = []
        for m in sorted(merged, key=lambda x: METHOD_ORDER.index(x) if x in METHOD_ORDER else 99):
            mons = sorted(merged[m].items(), key=lambda kv: (-kv[1][0], kv[0]))
            entry = {"m": m, "mons": []}
            for sid, (pct, lo, hi, c) in mons:
                row = {"id": sid, "p": pct, "lo": lo, "hi": hi}
                if c:
                    row["c"] = c
                entry["mons"].append(row)
            tabs.append(entry)
        floors.append({"label": fl.get("label"), "tables": tabs})
    loc = {k: v for k, v in g.items() if k != "areas"}
    loc["floors"] = floors
    locations.append(loc)

# ---------- trainer battles (from the world map render) ----------
import re as _re
markers_path = os.path.join(ROOT, "map", "markers.js")
bosses = json.load(open(os.path.join(ROOT, "tools", "bosses.json")))
OVERRIDE = [("SSAnne", "ss-anne"), ("Rocket Hideout", "rocket-hideout"), ("Celadon City Game Corner", "rocket-hideout"),
            ("Silph Co", "silph-co"), ("Viridian City Gym", "viridian-gym"), ("Pewter City Gym", "pewter-city"),
            ("Five Island Meadow", "five-isle-meadow"), ("Five Island Rocket Warehouse", "five-isle-meadow")]
def words(x):
    return " " + _re.sub(r"[^a-z0-9]+", " ", x.lower()).strip() + " "
bases = [(l, words(_re.sub(r"\s*\(.*\)$", "", l["name"])), words(l.get("mapName", l["name"]))) for l in locations]
def loc_for(name):
    for pre, lid in OVERRIDE:
        if name.startswith(pre):
            return next(l for l in locations if l["id"] == lid)
    w = words(name)
    best, bi, bl = None, -1, 0
    for l, b1, b2 in bases:
        for b in (b1, b2):
            i = w.find(b)
            if i >= 0 and (i > bi or (i == bi and len(b) > bl)):
                best, bi, bl = l, i, len(b)
    return best
unmatched = []
if os.path.exists(markers_path):
    ms = open(markers_path, encoding="utf-8").read()
    W = json.loads(ms[ms.index("=") + 1: ms.rindex(";")])
    for x, y, label, spr, place, party, leader in W["trainers"]:
        if not party:
            continue
        l = loc_for(place)
        if not l:
            unmatched.append(place)
            continue
        nm = label.replace("Leader ", "").replace("Swimmer M ", "Swimmer ").replace("Swimmer F ", "Swimmer ").replace("Sis And Bro", "Sis and Bro").replace("Pokemaniac", "PokéManiac")
        l.setdefault("battles", []).append({"n": nm, "p": party, "L": leader})
RIVAL = [("TRAINER_RIVAL_OAKS_LAB_CHARMANDER", "pallet-town"), ("TRAINER_RIVAL_ROUTE22_EARLY_CHARMANDER", "kanto-route-22"),
         ("TRAINER_RIVAL_CERULEAN_CHARMANDER", "cerulean-city"), ("TRAINER_RIVAL_SS_ANNE_CHARMANDER", "ss-anne"),
         ("TRAINER_RIVAL_POKEMON_TOWER_CHARMANDER", "pokemon-tower"), ("TRAINER_RIVAL_SILPH_CHARMANDER", "silph-co"),
         ("TRAINER_RIVAL_ROUTE22_LATE_CHARMANDER", "kanto-route-22"),
         ("TRAINER_ELITE_FOUR_LORELEI", "indigo-plateau"), ("TRAINER_ELITE_FOUR_BRUNO", "indigo-plateau"),
         ("TRAINER_ELITE_FOUR_AGATHA", "indigo-plateau"), ("TRAINER_ELITE_FOUR_LANCE", "indigo-plateau"),
         ("TRAINER_CHAMPION_FIRST_CHARMANDER", "indigo-plateau")]
NAMES = {"OAKS_LAB": "Rival (Oak's Lab)", "ROUTE22_EARLY": "Rival (first visit)", "CERULEAN": "Rival", "SS_ANNE": "Rival",
         "POKEMON_TOWER": "Rival", "SILPH": "Rival", "ROUTE22_LATE": "Rival (before the League)", "LORELEI": "Lorelei",
         "BRUNO": "Bruno", "AGATHA": "Agatha", "LANCE": "Lance", "CHAMPION": "Champion"}
rival_pos = {}
for tid, lid in RIVAL:
    if tid not in bosses:
        continue
    key = next(k for k in NAMES if k in tid)
    l = next(x for x in locations if x["id"] == lid)
    pos = rival_pos.get(lid, 0) if "RIVAL" in tid else len(l.get("battles", []))
    l.setdefault("battles", []).insert(pos, {"n": NAMES[key], "p": bosses[tid], "L": 1})
    if "RIVAL" in tid:
        rival_pos[lid] = pos + 1
if unmatched:
    print("trainers with no location:", sorted(set(unmatched)), file=sys.stderr)

unused = sorted(set(tables) - used_keys)
if unused:
    print("unused area keys:", unused, file=sys.stderr)

out = {
    "species": species,
    "locations": locations,
    "chapters": guide["chapters"],
    "unlocks": guide["unlocks"],
    "balls": guide["balls"],
    "extra": guide.get("extra", {}),
}
with open(os.path.join(ROOT, "data.js"), "w", encoding="utf-8") as f:
    f.write("// Generated by tools/build_data.py. Encounter data: PokeAPI (LeafGreen).\n")
    f.write("window.DEX=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("locations", len(locations), "species", len(species))
