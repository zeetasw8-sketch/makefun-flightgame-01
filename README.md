# Merapi Run — Island Flight

A flight game over a volcanic island. Fly the island circuit: thread all
8 orange rings, mind your fuel, and land on the runway to refuel.

## How to fly

- **Arrows or WASD** — pitch and bank. Banking turns the plane.
- **Shift** — throttle up. **Ctrl** — throttle down.
- **Mouse** — hold and drag left or right to bank. Click or Space to start.
- **P** — pause.

A gentle touchdown on the runway (slow, level, low sink rate) refuels you
and scores +150. Touching the ground anywhere else, or ditching in the
sea, ends the flight. Thread all 8 rings to complete the mission.

## The island

A 4 km square of hills around a volcano (620 m), with a flat runway on
the south shore and open sea beyond. The terrain, the volcano, the runway
and the rings are all generated from a seed (`?seed=N` fixes the layout).

## Files

- `game/index.html` — the page, a full-screen canvas.
- `game/src/main.js` — boot, the fixed-step loop, the five screens.
- `game/src/world.js` — flight physics, terrain height, rings, fuel,
  landings and crashes.
- `game/src/render.js` — the chase-view painter: sky, terrain grid,
  runway, rings, the 3D aeroplane and the HUD.
- `game/src/input.js` — keyboard and mouse.
- `game/src/config.js` — the tuning numbers.
- `game/src/random.js` — a seeded generator.
- `game/src/shots.js` — the three screenshot scenes.
- `main.ts` — copies `game/` and `screenshots/` to `/output` and writes
  `dossier.json` with the vendored make.fun library.
- `serve.ts` — a tiny static server for local play (`node serve.ts`).

## Play locally

```sh
node serve.ts
# open http://localhost:8080
```

Screenshots: `?shot=start|play|end&seed=42` stages a scene and sets
`window.__shotReady` when it is painted.
