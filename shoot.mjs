// shoot.mjs — take EMBERLINE's four dossier screenshots with a real Chrome.
//
// Each scene in shots.json is a deterministic staged frame of the actual game
// (the game freezes itself on window.__shotReady when ?shot= is in the URL).
// Captures go through the DevTools protocol (Page.captureScreenshot) rather
// than the --screenshot flag: under --virtual-time-budget the WebGL canvas
// never gets composited into the flag's capture, while a CDP capture of the
// live page shows the rendered scene. The script serves game/ locally,
// forces a 1280x720 viewport, waits for __shotReady per scene, and converts
// the captures to JPEGs small enough for the gate (each at most 256 KiB)
// with ffmpeg, raising the compression until they fit.
//
//   node shoot.mjs            (CHROME and FFMPEG env vars override the tools)

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME ?? '/home/hatch/workspace/tools/chrome/chrome-linux64/chrome';
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const PORT = 8137;
const CDP_PORT = 9337;
const MAX_BYTES = 262144;

const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`${cmd} failed (${r.status}): ${String(r.stderr).slice(-400)}`);
  }
  return r;
}

async function waitForServer(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error(`server at ${url} never answered`);
}

// Minimal CDP client over the built-in WebSocket: just enough to navigate,
// poll a JS expression, and grab composited screenshots.
async function connectCdp() {
  let targets = null;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://localhost:${CDP_PORT}/json/list`);
      targets = await res.json();
      if (targets && targets.some((t) => t.type === 'page')) break;
    } catch { /* chrome not up yet */ }
    await sleep(250);
  }
  const page = (targets ?? []).find((t) => t.type === 'page');
  if (!page) throw new Error('chrome exposed no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++seq;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  return { ws, send, evaluate };
}

const server = spawn('node', [join(here, 'serve.ts')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
});
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--hide-scrollbars', `--remote-debugging-port=${CDP_PORT}`,
  'about:blank',
], { stdio: 'ignore' });

try {
  await waitForServer(`http://localhost:${PORT}/`);
  const { ws, send, evaluate } = await connectCdp();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
  });
  for (const shot of shots) {
    const png = join(here, 'screenshots', shot.name.replace(/\.jpg$/, '.tmp.png'));
    const jpg = join(here, 'screenshots', shot.name);
    await send('Page.navigate', { url: `http://localhost:${PORT}/${shot.query}` });
    let ready = false;
    for (let i = 0; i < 150; i++) {
      if (await evaluate('window.__shotReady === true')) { ready = true; break; }
      await sleep(200);
    }
    if (!ready) throw new Error(`${shot.name}: page never set __shotReady`);
    await sleep(200); // let the compositor present the staged frame
    const shotRes = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const data = shotRes.result && shotRes.result.data;
    if (!data) throw new Error(`${shot.name}: captureScreenshot returned nothing`);
    writeFileSync(png, Buffer.from(data, 'base64'));
    let quality = 3;
    for (;;) {
      run(FFMPEG, ['-y', '-v', 'error', '-i', png, '-q:v', String(quality), jpg]);
      const size = statSync(jpg).size;
      if (size <= MAX_BYTES || quality >= 12) {
        console.log(`${shot.name}: ${size} bytes at q${quality}${size <= MAX_BYTES ? '' : ' — STILL OVER THE CAP'}`);
        break;
      }
      quality += 2;
    }
    unlinkSync(png);
  }
  ws.close();
} finally {
  server.kill();
  chrome.kill('SIGKILL');
}
