#!/usr/bin/env python3
"""Hand-written route order, unlocks and notes. Writes tools/guide.json.

Each location lists the PokeAPI area keys it covers, the chapter you first
reach it in, where it sits on the schematic maps, and what is locked there.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

CHAPTERS = [
    {"id": "brock", "name": "Pallet Town to Pewter", "badges": 0, "blurb": "Pick a starter, deliver Oak's Parcel, get through Viridian Forest. Brock is badge one."},
    {"id": "misty", "name": "Mt. Moon to Cerulean", "badges": 1, "blurb": "Mt. Moon, Nugget Bridge and Bill. Misty is badge two."},
    {"id": "surge", "name": "Vermilion and the S.S. Anne", "badges": 2, "blurb": "Underground Path, Cut from the S.S. Anne, the Old Rod. Lt. Surge is badge three."},
    {"id": "erika", "name": "Rock Tunnel to Celadon", "badges": 3, "blurb": "Rock Tunnel, Lavender, Celadon and the Rocket Hideout. Erika is badge four."},
    {"id": "koga", "name": "Pokémon Tower to Fuchsia", "badges": 4, "blurb": "Silph Scope, Poké Flute, both Snorlax, the Safari Zone. Koga is badge five."},
    {"id": "sabrina", "name": "Saffron and Silph Co.", "badges": 5, "blurb": "Clear Silph Co. Sabrina is badge six."},
    {"id": "blaine", "name": "Seafoam and Cinnabar", "badges": 6, "blurb": "Surf south past Seafoam to Cinnabar. Blaine is badge seven."},
    {"id": "sevii", "name": "Sevii Islands 1 to 3, then loose ends", "badges": 7, "blurb": "Bill takes you to One Island. Back in Kanto, Route 21 and the Power Plant before Giovanni."},
    {"id": "league", "name": "Victory Road and the League", "badges": 8, "blurb": "Route 23, Victory Road, the Elite Four."},
    {"id": "post", "name": "Postgame", "badges": 99, "blurb": "National Dex, Sevii Islands 4 to 7, Cerulean Cave, the legendaries."},
]

UNLOCKS = {
    "cut": {"name": "Cut", "group": "HMs you can use", "chapter": "surge"},
    "flash": {"name": "Flash", "group": "HMs you can use", "chapter": "misty"},
    "surf": {"name": "Surf", "group": "HMs you can use", "chapter": "blaine"},
    "strength": {"name": "Strength", "group": "HMs you can use", "chapter": "sabrina"},
    "rock-smash": {"name": "Rock Smash", "group": "HMs you can use", "chapter": "sevii"},
    "waterfall": {"name": "Waterfall", "group": "HMs you can use", "chapter": "post"},
    "old-rod": {"name": "Old Rod", "group": "Rods", "chapter": "surge"},
    "good-rod": {"name": "Good Rod", "group": "Rods", "chapter": "koga"},
    "super-rod": {"name": "Super Rod", "group": "Rods", "chapter": "koga"},
    "silph-scope": {"name": "Silph Scope", "group": "Key items", "chapter": "koga"},
    "poke-flute": {"name": "Poké Flute", "group": "Key items", "chapter": "koga"},
    "coin-case": {"name": "Coin Case", "group": "Key items", "chapter": "erika"},
    "bicycle": {"name": "Bicycle", "group": "Key items", "chapter": "erika"},
    "national-dex": {"name": "National Dex", "group": "Key items", "chapter": "post"},
    "rainbow-pass": {"name": "Rainbow Pass", "group": "Key items", "chapter": "post"},
    "sapphire": {"name": "Sapphire delivered", "group": "Key items", "chapter": "post"},
    "tanoby-key": {"name": "Tanoby Key solved", "group": "Key items", "chapter": "post"},
}

BALLS = {"poke": "brock", "great": "erika", "ultra": "koga", "safari": "koga"}

R = "kanto-route-"


def L(id, name, chapter, map, areas=None, req=None, **kw):
    d = {"id": id, "name": name, "chapter": chapter, "map": map}
    if areas is not None:
        d["areas"] = [{"label": a[0], "keys": a[1], **({"req": a[2]} if len(a) > 2 else {})} for a in areas]
    if req:
        d["req"] = req
    d.update(kw)
    return d


LOCATIONS = [
    # ---- brock
    L("pallet-town", "Pallet Town", "brock", "kanto:pallet", mapName="Pallet Town"),
    L(R + "1", "Route 1", "brock", "kanto:r1"),
    L("viridian-city", "Viridian City", "brock", "kanto:viridian"),
    L(R + "22", "Route 22", "brock", "kanto:r22"),
    L(R + "2", "Route 2", "brock", "kanto:r2", [("West path", [R + "2/south-towards-viridian-city"]), ("East side (Cut)", [R + "2/north-towards-pewter-city"], ["cut"])]),
    L("viridian-forest", "Viridian Forest", "brock", "kanto:viridian-forest"),
    L("pewter-city", "Pewter City (Gym)", "brock", "kanto:pewter", [], mapName="Pewter City Gym"),
    # ---- misty
    L(R + "3", "Route 3", "misty", "kanto:r3"),
    L("mt-moon", "Mt. Moon", "misty", "kanto:mt-moon", [("1F", ["mt-moon/1f"]), ("B1F", ["mt-moon/b1f"]), ("B2F", ["mt-moon/b2f"])], mapName="Mt. Moon 1F"),
    L(R + "4", "Route 4", "misty", "kanto:r4", [(None, [R + "4", R + "4/pokemon-center"])]),
    L("cerulean-city", "Cerulean City", "misty", "kanto:cerulean"),
    L(R + "24", "Route 24", "misty", "kanto:r24"),
    L(R + "25", "Route 25", "misty", "kanto:r25"),
    # ---- surge
    L(R + "5", "Route 5", "surge", "kanto:r5"),
    L("kanto-underground-path", "Underground Path (5 to 6)", "surge", "kanto:underground-path", mapName="Underground Path North Entrance"),
    L(R + "6", "Route 6", "surge", "kanto:r6"),
    L("vermilion-city", "Vermilion City", "surge", "kanto:vermilion", [("City", ["vermilion-city"]), ("Harbor by the S.S. Anne", ["ss-anne"])]),
    L("ss-anne", "S.S. Anne", "surge", "kanto:ss-anne", [], mapName="SSAnne 1F Corridor"),
    L(R + "11", "Route 11", "surge", "kanto:r11"),
    L("digletts-cave", "Diglett's Cave", "surge", "kanto:digletts-cave", mapName="Digletts Cave B1F"),
    # ---- erika
    L(R + "9", "Route 9", "erika", "kanto:r9", req=["cut"]),
    L(R + "10", "Route 10", "erika", "kanto:r10", req=["cut"]),
    L("rock-tunnel", "Rock Tunnel", "erika", "kanto:rock-tunnel", [("1F", ["rock-tunnel/1f"]), ("B1F", ["rock-tunnel/b1f"])], req=["cut"], mapName="Rock Tunnel 1F"),
    L(R + "8", "Route 8", "erika", "kanto:r8", walkReq=["cut"]),
    L(R + "7", "Route 7", "erika", "kanto:r7"),
    L("celadon-city", "Celadon City", "erika", "kanto:celadon", [("City", ["celadon-city"]), ("Celadon Mansion", ["celadon-city/celadon-mansion"]), ("Game Corner prizes", ["celadon-city/prize-corner"], ["coin-case"])]),
    L("rocket-hideout", "Rocket Hideout", "erika", "kanto:celadon", [], mapName="Rocket Hideout B1F"),
    L(R + "16", "Route 16", "erika", "kanto:r16", walkReq=["cut"]),
    # ---- koga
    L("pokemon-tower", "Pokémon Tower", "koga", "kanto:pokemon-tower", [("3F", ["pokemon-tower/3f"]), ("4F", ["pokemon-tower/4f"]), ("5F", ["pokemon-tower/5f"]), ("6F", ["pokemon-tower/6f"]), ("7F", ["pokemon-tower/7f"])], req=["silph-scope"], mapName="Pokémon Tower 3F"),
    L(R + "12", "Route 12", "koga", "kanto:r12", walkReq=["cut"]),
    L(R + "13", "Route 13", "koga", "kanto:r13", walkReq=["cut"]),
    L(R + "14", "Route 14", "koga", "kanto:r14", walkReq=["cut"]),
    L(R + "15", "Route 15", "koga", "kanto:r15"),
    L("fuchsia-city", "Fuchsia City", "koga", "kanto:fuchsia"),
    L("kanto-safari-zone", "Safari Zone", "koga", "kanto:safari-zone", [("Center", ["kanto-safari-zone/middle"]), ("Area 1 (East)", ["kanto-safari-zone/area-1-east"]), ("Area 2 (North)", ["kanto-safari-zone/area-2-north"]), ("Area 3 (West)", ["kanto-safari-zone/area-3-west"])], safari=True, mapName="Safari Zone Center"),
    L(R + "17", "Route 17 (Cycling Road)", "koga", "kanto:r17", req=["bicycle"]),
    L(R + "18", "Route 18", "koga", "kanto:r18"),
    # ---- sabrina
    L("saffron-city", "Saffron City", "sabrina", "kanto:saffron", [("Fighting Dojo", ["saffron-city/fighting-dojo"]), ("Silph Co. 7F", ["saffron-city/silph-co-7f"])]),
    L("silph-co", "Silph Co.", "sabrina", "kanto:saffron", [], mapName="Silph Co 1F"),
    # ---- blaine
    L("kanto-sea-route-19", "Route 19", "blaine", "kanto:r19", req=["surf"]),
    L("kanto-sea-route-20", "Route 20", "blaine", "kanto:r20", req=["surf"]),
    L("seafoam-islands", "Seafoam Islands", "blaine", "kanto:seafoam", [("1F", ["seafoam-islands/1f"]), ("B1F", ["seafoam-islands/b1f"]), ("B2F", ["seafoam-islands/b2f"]), ("B3F", ["seafoam-islands/b3f"], ["strength"]), ("B4F", ["seafoam-islands/b4f"], ["strength"])], req=["surf"], mapName="Seafoam Islands 1F"),
    L("cinnabar-island", "Cinnabar Island", "blaine", "kanto:cinnabar", [("Island", ["cinnabar-island"]), ("Pokémon Lab", ["cinnabar-island/cinnabar-lab"])], req=["surf"]),
    L("pokemon-mansion", "Pokémon Mansion", "blaine", "kanto:mansion", [("1F", ["pokemon-mansion/1f"]), ("2F", ["pokemon-mansion/2f"]), ("3F", ["pokemon-mansion/3f"]), ("B1F", ["pokemon-mansion/b1f"])], req=["surf"], mapName="Pokémon Mansion 1F"),
    # ---- sevii 1-3
    L("one-island", "One Island", "sevii", "sevii:one"),
    L("kindle-road", "Kindle Road", "sevii", "sevii:kindle", req=["surf"]),
    L("treasure-beach", "Treasure Beach", "sevii", "sevii:treasure", req=["surf"]),
    L("mt-ember", "Mt. Ember", "sevii", "sevii:mt-ember", [
        ("Exterior", ["mt-ember"], ["strength"]), ("Summit Path 1F/3F", ["mt-ember/cave"]), ("Summit Path 2F", ["mt-ember/inside"]), ("Ruby Path 1F", ["mt-ember/1f-cave-behind-team-rocket"], ["national-dex"]),
        ("Ruby Path B1F", ["mt-ember/b1f"], ["national-dex"]), ("Ruby Path B2F", ["mt-ember/b2f"], ["national-dex"]), ("Ruby Path B3F", ["mt-ember/b3f"], ["national-dex"]), ("Summit", ["mt-ember/summit"])], mapName="Mt. Ember Exterior"),
    L("cape-brink", "Cape Brink (Two Island)", "sevii", "sevii:cape-brink"),
    L("bond-bridge", "Bond Bridge", "sevii", "sevii:bond"),
    L("berry-forest", "Berry Forest", "sevii", "sevii:berry-forest"),
    L("three-isle-port", "Three Isle Port", "sevii", "sevii:three-isle-port", req=["national-dex"], mapName="Three Island Port"),
    L("kanto-sea-route-21", "Route 21", "sevii", "kanto:r21", req=["surf"]),
    L("kanto-power-plant", "Power Plant", "sevii", "kanto:power-plant", req=["surf"]),
    L("viridian-gym", "Viridian Gym", "sevii", "kanto:viridian", [], mapName="Viridian City Gym"),
    # ---- league
    L(R + "23", "Route 23", "league", "kanto:r23", req=["surf"]),
    L("kanto-victory-road-2", "Victory Road", "league", "kanto:victory-road", [("1F", ["kanto-victory-road-2/1f"]), ("2F", ["kanto-victory-road-2/2f"]), ("3F", ["kanto-victory-road-2/3f"])], mapName="Victory Road 1F"),
    L("indigo-plateau", "Indigo Plateau", "league", "kanto:indigo", [], mapName="Indigo Plateau Exterior"),
    # ---- postgame
    L("roaming-kanto", "Roaming beast", "post", "kanto:pallet", [(None, ["roaming-kanto/area"])], req=["hof", "sapphire"], mapName="Route 1"),
    L("four-island", "Four Island", "post", "sevii:four", req=["rainbow-pass"]),
    L("icefall-cave", "Icefall Cave", "post", "sevii:icefall-cave", [("Entrance", ["icefall-cave/entrance"]), ("1F", ["icefall-cave/1f"]), ("B1F", ["icefall-cave/b1f"]), ("Back (Waterfall)", ["icefall-cave/waterfall"], ["waterfall"])], mapName="Four Island Icefall Cave Entrance", req=["rainbow-pass", "surf"]),
    L("five-island", "Five Island", "post", "sevii:five", req=["rainbow-pass"]),
    L("five-isle-meadow", "Five Isle Meadow", "post", "sevii:meadow", req=["rainbow-pass"]),
    L("memorial-pillar", "Memorial Pillar", "post", "sevii:memorial", req=["rainbow-pass", "surf"]),
    L("water-labyrinth", "Water Labyrinth", "post", "sevii:water-lab", req=["rainbow-pass", "surf"]),
    L("resort-gorgeous", "Resort Gorgeous", "post", "sevii:resort-gorgeous", req=["rainbow-pass", "surf"]),
    L("lost-cave", "Lost Cave", "post", "sevii:lost-cave", [("Rooms", ["lost-cave/room-%d" % i for i in range(1, 11)]), ("Item rooms", ["lost-cave/item-rooms"])], mapName="Five Island Lost Cave Entrance", req=["rainbow-pass", "surf"]),
    L("water-path", "Water Path", "post", "sevii:water-path", req=["rainbow-pass"]),
    L("ruin-valley", "Ruin Valley", "post", "sevii:ruin-valley", req=["rainbow-pass"]),
    L("green-path", "Green Path", "post", "sevii:green-path", req=["rainbow-pass"]),
    L("outcast-island", "Outcast Island", "post", "sevii:outcast", req=["rainbow-pass", "surf"]),
    L("pattern-bush", "Pattern Bush", "post", "sevii:pattern-bush", req=["rainbow-pass"]),
    L("kanto-altering-cave", "Altering Cave", "post", "sevii:altering-cave", [(None, ["kanto-altering-cave/a"])], mapName="Six Island Altering Cave", req=["rainbow-pass", "surf"]),
    L("trainer-tower", "Trainer Tower (Seven Island)", "post", "sevii:trainer-tower", req=["rainbow-pass"]),
    L("canyon-entrance", "Sevault Canyon Entrance", "post", "sevii:canyon", req=["rainbow-pass"]),
    L("sevault-canyon", "Sevault Canyon", "post", "sevii:sevault", req=["rainbow-pass"]),
    L("tanoby-ruins", "Tanoby Ruins", "post", "sevii:tanoby", [("Sea", ["tanoby-ruins"]), ("Chambers (Unown)", ["monean-chamber", "liptoo-chamber", "weepth-chamber", "dilford-chamber", "scufib-chamber", "rixy-chamber", "viapos-chamber"], ["tanoby-key"])], req=["rainbow-pass", "surf"]),
    L("cerulean-cave", "Cerulean Cave", "post", "kanto:cerulean-cave", [("1F", ["cerulean-cave/1f"]), ("2F", ["cerulean-cave/2f"]), ("B1F", ["cerulean-cave/b1f"])], req=["hof", "sapphire", "surf"], mapName="Cerulean Cave 1F"),
]

if __name__ == "__main__":
    extra_path = os.path.join(HERE, "notes.json")
    notes = json.load(open(extra_path, encoding="utf-8")) if os.path.exists(extra_path) else {}
    for loc in LOCATIONS:
        loc.update(notes.get("locations", {}).get(loc["id"], {}))
    out = {"chapters": CHAPTERS, "unlocks": UNLOCKS, "balls": notes.get("balls", BALLS), "locations": LOCATIONS, "extra": notes.get("extra", {})}
    for k, v in notes.get("unlocks", {}).items():
        out["unlocks"].setdefault(k, {}).update(v)
    json.dump(out, open(os.path.join(HERE, "guide.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("guide.json written:", len(LOCATIONS), "locations")
