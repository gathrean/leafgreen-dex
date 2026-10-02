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
    for fl in g.get("areas", [{"keys": [g["id"]]}]):
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
