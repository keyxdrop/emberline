# EMBERLINE

A 5v5 tactical FPS that runs entirely in a desktop browser. Ember attacks,
Ashen defends, and between them sits a burning foundry, one Spark Charge, and
thirty seconds of fuse. First side to five rounds takes the yard.

**Buy smart. Plant the Spark. Hold the line.**

[![make.fun bounty](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01)
[![rank](https://make.fun/badge/best-game-01/keyxdrop/emberline/rank.svg)](https://make.fun/bounty/best-game-01)
[![reward](https://make.fun/badge/best-game-01/keyxdrop/emberline/reward.svg)](https://make.fun/bounty/best-game-01)

Entered in the [best-game-01 bounty on make.fun](https://make.fun/bounty/best-game-01).

## The game

- **Rounds with a real economy.** Fifteen-second buy phases, eight shop rows
  (five guns, a grenade, a vest, a flash gadget), kill and plant bounties,
  win/loss bonuses that carry between rounds.
- **Two ways to win a round.** Wipe the other squad, or plant the Spark
  Charge at the Forge and guard it until it blows. Ashen can pull the charge
  and steal the round back — if they reach it alive.
- **Nine bot fighters with names and jobs.** Waypoint routes down three lanes
  (Slag Alley, Furnace Row, Kiln Run), burst-fire discipline, preferred ranges
  per weapon, fall-backs when hurt, radio callouts — and aim that sharpens by
  about 4% every round, so late rounds bite harder than early ones.
- **A coach for your first rounds.** An objective marker with a live distance
  readout, hint chips that sequence your first two rounds, and a damage arc
  that points at whoever just shot you.
- **Feel.** Tracers, impact sparks, score-aware round banners, a final-blow
  callout for the kill a round is remembered by, a fast-pulsing alarm ring
  once the charge is live, and an ember fountain when it goes off. All sound
  is synthesised in code with WebAudio — no audio files.

## Play it

```sh
node serve.ts        # serves game/ on http://localhost:8080
```

Open the address in desktop Chrome, click **Deploy**, and play:

| Input | Action |
| --- | --- |
| WASD / mouse | Move / aim |
| Click / right-click | Fire / aim down sights |
| R | Reload |
| E (hold) | Plant the charge at the Forge |
| G / F | Throw Pop Charge / Flash Charge |
| B, 1–8 | Buy menu and rows |
| Shift / Ctrl | Walk / crouch |

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the kit's `vendor/makefun-game.ts`.

## Screenshots

The four dossier screenshots are staged, deterministic frames of the real
game (`?shot=start|buy|play|end&seed=1`), re-taken with:

```sh
node shoot.mjs       # real Chrome + ffmpeg; see shots.json
```

## Layout

- `game/index.html` — the page and every HUD element
- `game/src/config.js` — the rulebook: weapons, economy, callouts, tuning
- `game/src/world.js` — the Foundry Yard: geometry, colliders, waypoints
- `game/src/player.js` — the human body: movement, aim, the gun in hand
- `game/src/bots.js` — the nine bot fighters and their brains
- `game/src/effects.js` — tracers, sparks, flashes, the ember fountain
- `game/src/audio.js` — a WebAudio synthesiser for every sound
- `game/src/hud.js` — scoreboard, killfeed, buy menu, banners
- `game/src/coach.js` — objective marker, hint chips, damage arc
- `game/src/main.js` — the match director that runs all of it
- `game/three.module.min.js` — three.js (r160), vendored as a minified build

Licensed under the MIT License (see `LICENSE`).
