// EMBERLINE — a complete tactical FPS that runs in a desktop browser, entered
// in make.fun's "Make the best game". The program (Node 22, standard library
// only) hands the game in: it copies game/ (the playable game as static files)
// and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library.
//
// The game itself: Foundry Yard at dusk — painted concrete, corrugated walls,
// a crane, pipework, drifting embers and furnace smoke. Two teams of five play
// rounds of plant-and-defuse: Ember carries the Spark Charge to Relay A or
// Relay B, Ashen tries to stop them, and the first team to 5 rounds takes the
// match. Between rounds a buy phase runs a small economy — five guns, a Spark
// grenade, a Flash Charge that blinds whoever looks at it, and armour — and
// the bots play real rounds back: set routes, holds, burst fire, radio
// callouts and wounded retreats. A first-minute coach (game/src/coach.js)
// points new players at the objective with an on-screen marker, sequences the
// round's one job at a time, and shows which direction damage came from.
// Everything runs offline from the static files: no server, no network, no
// build step — three.js is vendored under game/vendor/.
//
// The screenshots are real renders of this game's own staged scenes
// (?shot=start|buy|play|end&seed=1), captured in desktop Chrome.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
