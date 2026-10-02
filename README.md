# LeafGreen Dex

A route-by-route catch checklist for Pokémon LeafGreen, built for playing along on a phone.

- **Routes**: every location in story order, with encounter odds, level ranges, the ball to bring, and what's locked behind Cut, Surf, rods and so on.
- **Pokédex**: all 151 (or 386), where to find each one, evolutions, and catch odds per ball.
- **Map**: the full Kanto and Sevii world with toggleable items, hidden items, obstacles, trainers, people, doors and Pokémon.
- **Prof. Oak**: call him for a rating of your Pokédex, plus his aides' rewards.

Checkmarks save in the browser. Connect a GitHub token with Gist read/write (button in the top right) to sync them between devices through a private Gist.

## Rebuilding the data

```
python3 tools/guide.py
python3 tools/build_data.py <path to PokeAPI data/v2/csv>
python3 tools/render_map.py <path to a pret/pokefirered checkout>
```

Encounter data comes from [PokeAPI](https://github.com/PokeAPI/pokeapi), the world map is rendered from the [pret/pokefirered](https://github.com/pret/pokefirered) decompilation, and sprites are from the [PokeAPI sprite archive](https://github.com/PokeAPI/sprites). Fan project, not affiliated with Nintendo, Game Freak or The Pokémon Company.
