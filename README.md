# EMBERLINE

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/keyxdrop/emberline/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/keyxdrop/emberline/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**A 5v5 tactical FPS that runs entirely in your browser — no download, no install, no sign-up.** Open one file and you are in a plant-and-defuse match at Foundry Yard, a dusk industrial site of painted concrete, corrugated walls, a crane, pipework, drifting embers and furnace smoke.

Ember carries the **Spark Charge** to Relay A or Relay B. Ashen tries to stop them. Rounds are won by elimination or by planting and defending the Spark — first to **5 rounds** takes the match. Between rounds, a buy phase runs a real economy: five guns (sidearm, SMG, rifle, shotgun, sniper), a Spark grenade, a Flash Charge that blinds whoever looks at it, and armour. The bots play real rounds back — set routes, holds, burst fire, radio callouts and wounded retreats.

New to tactical shooters? A built-in **coach** teaches the game while you play it: an amber diamond marks the objective with its distance, one hint at a time names the job of the moment in your first rounds, and a red arc shows which direction a hit came from.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — or just open `game/index.html` through any static file server. Everything runs offline from the files in `game/`; three.js is vendored, there is no build step and no network request.

## Controls

| Keys | Action |
| --- | --- |
| W A S D / Mouse / Click | Move / look / fire |
| R | Reload |
| B | Buy menu (buy phase) |
| 1–5 | Weapons · 6/7/8 buy grenade, armour, flash |
| G / Q | Throw Spark grenade / Flash Charge |
| E (hold) | Plant or defuse the Spark |
| Ctrl / Space | Crouch / jump |

## How it is built

Plain ES modules under `game/src/`, one job each: `world` (the yard), `bots` (the nine AI players), `weapons`, `rounds` (match state), `hud` (the DOM interface), `coach` (first-minute guidance), `effects`, `audio` (synthesised, no audio files), `physics`, `player`, `input`, `textures`, `palette`, `rng`. `main.ts` copies `game/` and `screenshots/` to the output and writes the dossier the make.fun judge reads. MIT licensed.

---

<sub>Entered on [make.fun](https://make.fun/?ref=jvfpr51e&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
