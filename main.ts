// EMBERLINE's hand-in program (Node 22, standard library only).
//
// The game itself is the static site under game/ — index.html and its modules,
// playable offline in a desktop browser. This program's whole job is to hand
// that game in the way best-game-01 asks: copy game/ and screenshots/ into the
// output directory and write dossier.json there with the kit's own library
// (vendor/makefun-game.ts, copied from the kit unchanged), so the dossier the
// judge reads is byte for byte the one the scorer rebuilds.
//
// Run it the way the grader does, or point MAKEFUN_OUTPUT_DIR at a scratch
// folder to rehearse the hand-in locally:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's caps, from the kit's reference/gate.json. Only the text cap
// shapes the dossier's bytes; the rest exist so this program refuses, loudly
// and early, anything the scorer would refuse anyway.
const GATE_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function handIn() {
  mkdirSync(outDir, { recursive: true });
  cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
  const shotsDir = join(outDir, 'screenshots');
  mkdirSync(shotsDir, { recursive: true });
  const localShots = join(repoRoot, 'screenshots');
  if (existsSync(localShots)) {
    cpSync(localShots, shotsDir, { recursive: true });
  }
  const dossier = buildDossier(outDir, GATE_CAPS);
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  console.log(`emberline: handed in game/ + screenshots/ with a ${dossier.length}-byte dossier at ${outDir}`);
}

handIn();
