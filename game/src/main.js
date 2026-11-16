// main.js — EMBERLINE itself: the match director. It owns the phases (title,
// buy, live, round end, match end), the economy, the Spark Charge, combat
// resolution for every bullet and charge thrown, and the staged screenshot
// scenes. The modules under it each own one craft — world, bodies, brains,
// paint, sound, teaching — and this file is where they meet.

import * as THREE from 'three';
import {
  MATCH, WEAPONS, GEAR, BUY_ROWS, BOT_LOADOUTS, EMBER_NAMES, ASHEN_NAMES,
  PLAYER_NAME, CALLOUTS, LANES,
} from './config.js';
import { seedRandom, rand, randRange, pick, fillLine } from './rng.js';
import {
  buildWorld, makeNameSprite, SITE, EMBER_SPAWNS, ASHEN_SPAWNS, losClear, nearestNode,
} from './world.js';
import { Effects } from './effects.js';
import { SoundFX } from './audio.js';
import { Player } from './player.js';
import { Bot, setNameSpriteFactory } from './bots.js';
import { Hud } from './hud.js';
import { Coach } from './coach.js';

seedRandom(20261116);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 400);
scene.add(camera);

const world = buildWorld(scene);
const effects = new Effects(scene);
const sfx = new SoundFX();
const hud = new Hud();
const coach = new Coach(hud, camera);

setNameSpriteFactory(makeNameSprite);

// ---------- fighters ----------
const player = new Player(camera, renderer.domElement, {
  onShoot: (def, origin, dir) => resolvePlayerShot(def, origin, dir),
  onDryFire: () => sfx.dryFire(),
  onReload: () => sfx.reload(),
  onHurt: (fromPos) => { coach.onPlayerHurt(fromPos, player.pos, player.yaw); sfx.hurt(); },
  onDeath: () => { /* handled by the death sweep below, which knows the killer */ },
});
player.team = 'ember';
player.name = PLAYER_NAME;
player.isPlayer = true;

const bots = [];
EMBER_NAMES.forEach((name) => bots.push(new Bot(scene, 'ember', name)));
ASHEN_NAMES.forEach((name) => bots.push(new Bot(scene, 'ashen', name)));
const fighters = [player, ...bots];
const enemiesOf = (team) => fighters.filter((f) => f.team !== team && f.alive);

// The Spark Charge prop: a hot little box that rides above its carrier's head.
const chargeMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.3, 0.2, 0.3),
  new THREE.MeshStandardMaterial({ color: 0x201409, emissive: 0xff6a1a, emissiveIntensity: 2.2, roughness: 0.4 }),
);
scene.add(chargeMesh);

// ---------- match state ----------
const S = {
  phase: 'title', // title | buy | live | roundEnd | matchEnd
  phaseTimer: 0,
  round: 1,
  scoreE: 0,
  scoreA: 0,
  money: MATCH.startMoney,
  roundClock: MATCH.roundSeconds,
  planted: false,
  chargeTimer: 0,
  charge: { state: 'carried', carrier: player, pos: new THREE.Vector3(SITE.x, 0, SITE.z) },
  plantProgress: 0,
  lastKill: null,
  radioFreeAt: 0,
  nextBeep: 0,
  defuseWarned: false,
  stats: { kills: 0, deaths: 0, plants: 0, shots: 0, hits: 0 },
  projectiles: [],
  flashTime: 0,
  now: 0,
};

function laneName(x) {
  if (x < -8) return LANES.west;
  if (x > 8) return LANES.east;
  return LANES.mid;
}

function say(bot, poolKey, bag = {}) {
  if (S.now < S.radioFreeAt) return;
  S.radioFreeAt = S.now + 2.6;
  hud.radio(bot.name, fillLine(pick(CALLOUTS[poolKey]), bag), bot.team);
}

function falloff(def, dist) {
  const [a, b] = def.falloff;
  if (dist <= a) return 1;
  if (dist >= b) return 0.4;
  return 1 - 0.6 * ((dist - a) / (b - a));
}

// ---------- combat ----------

const raycaster = new THREE.Raycaster();
const tmpV = new THREE.Vector3();

function worldHitDist(origin, dir, maxDist) {
  raycaster.set(origin, dir);
  raycaster.far = maxDist;
  const hits = raycaster.intersectObjects(world.solids.children, false);
  return hits.length > 0 ? hits[0] : null;
}

// A bot's body as a cylinder: returns the hit distance and whether it is a head.
function botHit(bot, origin, dir) {
  tmpV.set(bot.pos.x - origin.x, 0, bot.pos.z - origin.z);
  const t = tmpV.x * dir.x + tmpV.z * dir.z;
  if (t < 0.2 || t > 130) return null;
  const px = origin.x + dir.x * t;
  const py = origin.y + dir.y * t;
  const pz = origin.z + dir.z * t;
  const dx = px - bot.pos.x;
  const dz = pz - bot.pos.z;
  if (dx * dx + dz * dz > 0.45 * 0.45) return null;
  if (py < 0.05 || py > 1.86) return null;
  return { dist: t, head: py > 1.44, point: new THREE.Vector3(px, py, pz) };
}

function resolvePlayerShot(def, origin, dir) {
  S.stats.shots += 1;
  S.noise = { x: player.pos.x, z: player.pos.z, at: S.now, team: 'ember' };
  sfx.shot(def.kind);
  effects.flash(origin, 0.65, 14);
  const spreadScale = (player.ads ? 0.55 : 1) * (player.crouch ? 0.8 : 1);
  for (let p = 0; p < def.pellets; p++) {
    const d = dir.clone();
    d.x += (rand() - 0.5) * 2 * def.spread * spreadScale;
    d.y += (rand() - 0.5) * 2 * def.spread * spreadScale;
    d.z += (rand() - 0.5) * 2 * def.spread * spreadScale;
    d.normalize();
    const wall = worldHitDist(origin, d, 130);
    const wallDist = wall ? wall.distance : 130;
    let best = null;
    for (const bot of bots) {
      if (!bot.alive || bot.team === 'ember') continue;
      const hit = botHit(bot, origin, d);
      if (hit && hit.dist < wallDist && (!best || hit.dist < best.hit.dist)) best = { bot, hit };
    }
    const end = best ? best.hit.point : origin.clone().add(d.clone().multiplyScalar(Math.min(wallDist, 60)));
    effects.tracer(origin, end, 0xffc37a);
    if (best) {
      S.stats.hits += 1;
      const dmg = def.damage * falloff(def, best.hit.dist) * (best.hit.head ? 2 : 1);
      const wasAlive = best.bot.alive;
      best.bot.takeDamage(dmg, player, S.now);
      effects.sparks(best.hit.point, 5, 0xff5030);
      if (wasAlive && !best.bot.alive) {
        hud.hitmarker(true);
        sfx.kill();
        onKill(player, best.bot, def.name);
      } else {
        hud.hitmarker(false);
        sfx.hit();
      }
    } else if (wall) {
      effects.sparks(wall.point, 3, 0xffa050);
    }
  }
}

function resolveBotShot(bot, target) {
  const def = bot.def;
  S.noise = { x: bot.pos.x, z: bot.pos.z, at: S.now, team: bot.team };
  const muzzle = bot.muzzlePos();
  const dist = Math.hypot(target.pos.x - bot.pos.x, target.pos.z - bot.pos.z);
  if (dist < 34) sfx.shot(def.kind);
  effects.flash(muzzle, 0.55, 10);
  const chest = new THREE.Vector3(target.pos.x, target.isPlayer ? 1.3 : 1.25, target.pos.z);
  let p = Math.max(0.16, Math.min(0.66, 0.66 - dist * 0.0075));
  if (bot.team === 'ashen' && target.isPlayer) p *= (2 - bot.reactionScale) * 0.8;
  if (bot.team === 'ember') p *= 0.92;
  const hitRoll = rand();
  if (hitRoll < p) {
    const head = rand() < 0.12;
    const dmg = def.damage * falloff(def, dist) * (head ? 2 : 1);
    effects.tracer(muzzle, chest, bot.team === 'ember' ? 0xffc37a : 0xa8c8ff);
    effects.sparks(chest, 4, 0xff5030);
    if (target.isPlayer) {
      player.lastAttacker = bot;
      player.takeDamage(dmg, bot.pos);
      if (!player.alive) onKill(bot, player, def.name);
    } else {
      const wasAlive = target.alive;
      target.takeDamage(dmg, bot, S.now);
      if (wasAlive && !target.alive) onKill(bot, target, def.name);
    }
  } else {
    const off = chest.clone();
    off.x += randRange(0.7, 1.7) * (rand() < 0.5 ? -1 : 1);
    off.y += randRange(-0.3, 0.7);
    off.z += randRange(0.7, 1.7) * (rand() < 0.5 ? -1 : 1);
    effects.tracer(muzzle, off, bot.team === 'ember' ? 0xffc37a : 0xa8c8ff);
  }
}

function dropCharge(victim) {
  if (S.charge.carrier === victim && S.charge.state === 'carried') {
    S.charge.state = 'dropped';
    S.charge.carrier = null;
    S.charge.pos.set(victim.pos.x, 0, victim.pos.z);
  }
}

function onKill(killer, victim, weaponName) {
  S.lastKill = { killer, victim };
  hud.killfeed(killer.name, victim.name, weaponName, killer.team, victim.team);
  if (killer.isPlayer) {
    S.stats.kills += 1;
    S.money = Math.min(MATCH.maxMoney, S.money + MATCH.killReward);
    hud.setWallet(S.money);
  }
  if (victim.isPlayer) {
    S.stats.deaths += 1;
    S.playerDeathHandled = true;
  }
  dropCharge(victim);
  if (victim.team === 'ember' && !victim.isPlayer && rand() < 0.4) {
    const mate = bots.find((b) => b.team === 'ember' && b.alive);
    if (mate) say(mate, 'roundLose', {});
  }
  checkElimination();
}

function checkElimination() {
  if (S.phase !== 'live') return;
  const eAlive = fighters.some((f) => f.team === 'ember' && f.alive);
  const aAlive = fighters.some((f) => f.team === 'ashen' && f.alive);
  if (!aAlive) endRound('ember', 'elimination');
  else if (!eAlive && !S.planted) endRound('ashen', 'elimination');
}

// ---------- the charge ----------

function plantCharge(by) {
  S.planted = true;
  S.charge.state = 'planted';
  S.charge.pos.set(SITE.x, 0, SITE.z);
  S.chargeTimer = MATCH.chargeSeconds;
  S.nextBeep = 0;
  S.defuseWarned = false;
  world.setRingMode('planted');
  if (by.isPlayer) {
    S.stats.plants += 1;
    S.money = Math.min(MATCH.maxMoney, S.money + MATCH.plantReward);
    hud.setWallet(S.money);
  }
  const mate = bots.find((b) => b.team === 'ember' && b.alive) ?? by;
  say(mate.isPlayer ? (bots.find((b) => b.team === 'ember' && b.alive) ?? mate) : mate, 'planted', {});
  coach.onPlanted(true);
  sfx.plantBeep(true);
}

function defuseCharge() {
  S.planted = false;
  S.charge.state = 'gone';
  world.setRingMode('idle');
  sfx.defuseDone();
  endRound('ashen', 'defuse');
}

function detonateCharge() {
  const pos = new THREE.Vector3(S.charge.pos.x, 0.6, S.charge.pos.z);
  effects.emberFountain(pos);
  sfx.explosion();
  S.charge.state = 'gone';
  world.setRingMode('idle');
  endRound('ember', 'detonation');
}

// ---------- phases ----------

function resetRound() {
  S.planted = false;
  S.roundClock = MATCH.roundSeconds;
  S.chargeTimer = 0;
  S.plantProgress = 0;
  S.lastKill = null;
  S.defuseWarned = false;
  S.playerDeathHandled = false;
  world.setRingMode('idle');
  hud.plantProgress(null);

  player.resetRound(EMBER_SPAWNS[0], {
    weapon: player.alive && S.round > 1 ? true : false,
    armour: player.alive && S.round > 1 ? player.armour : false,
    grenades: 0, flashes: 0,
  });
  if (S.round === 1 || !player.wasAliveLastRound) {
    player.weaponId = 'sidekick';
    player.ammo = WEAPONS.sidekick.mag;
    player.reserve = WEAPONS.sidekick.reserve;
    player.armour = false;
  }
  player.grenades = 0;
  player.flashes = 0;

  const tier = BOT_LOADOUTS[Math.min(S.round - 1, BOT_LOADOUTS.length - 1)];
  bots.forEach((bot, i) => {
    const spawn = bot.team === 'ember' ? EMBER_SPAWNS[i % EMBER_NAMES.length + 1] ?? EMBER_SPAWNS[1] : ASHEN_SPAWNS[i - EMBER_NAMES.length];
    const variety = BOT_LOADOUTS[Math.min(S.round - 1 + (i % 2), BOT_LOADOUTS.length - 1)];
    const load = i % 3 === 0 ? tier : variety;
    bot.resetRound(spawn, load.weapon, load.armour);
    bot.reactionScale = bot.team === 'ashen'
      ? Math.max(0.75, Math.pow(0.96, S.round - 1))
      : 1;
    assignObjective(bot);
  });

  S.charge.state = 'carried';
  S.charge.carrier = player;
  S.charge.pos.set(SITE.x, 0, SITE.z);
  hud.setScore(S.scoreE, S.scoreA, S.round);
  hud.setWallet(S.money);
}

function assignObjective(bot) {
  if (bot.team === 'ember') {
    const idx = EMBER_NAMES.indexOf(bot.name);
    bot.setObjective([16, 14, 11, 17][idx % 4]);
  } else {
    const idx = ASHEN_NAMES.indexOf(bot.name);
    bot.setObjective([16, 14, 12, 13, 15][idx % 5]);
  }
}

function startBuy() {
  S.phase = 'buy';
  S.phaseTimer = MATCH.buySeconds;
  resetRound();
  player.enabled = false;
  hud.showBuy(S.phaseTimer);
  refreshBuy();
  coach.onBuyPhase(S.round);
}

function startLive() {
  S.phase = 'live';
  hud.hideBuy();
  hud.clearChips();
  coach.onLiveStart(S.round);
  player.enabled = true;
  sfx.horn();
}

function endRound(winner, reason) {
  if (S.phase !== 'live') return;
  S.phase = 'roundEnd';
  S.phaseTimer = MATCH.endSeconds;
  player.enabled = false;
  player.wasAliveLastRound = player.alive;
  hud.plantProgress(null);
  if (winner === 'ember') S.scoreE += 1; else S.scoreA += 1;
  S.money = Math.min(MATCH.maxMoney, S.money + (winner === 'ember' ? MATCH.winReward : MATCH.lossReward));
  hud.setWallet(S.money);
  hud.setScore(S.scoreE, S.scoreA, S.round);

  const reasonLine = {
    elimination: winner === 'ember' ? 'The Ashen squad is wiped out' : 'The Ember squad is wiped out',
    detonation: 'The Spark did its work',
    defuse: 'The charge was pulled and killed',
    time: 'The Forge stays cold — time expired',
  }[reason];
  const matchPoint = (S.scoreE === MATCH.roundsToWin - 1 && winner === 'ember') ||
    (S.scoreA === MATCH.roundsToWin - 1 && winner === 'ashen');
  const title = winner === 'ember' ? 'EMBER TAKES THE ROUND' : 'ASHEN HOLDS THE YARD';
  const sub = matchPoint
    ? `${reasonLine} — MATCH POINT ${winner === 'ember' ? 'EMBER' : 'ASHEN'} • ${S.scoreE}–${S.scoreA}`
    : `${reasonLine} • ${S.scoreE}–${S.scoreA}`;
  hud.banner(title, sub, MATCH.endSeconds - 0.4);
  sfx.sting(winner === 'ember');

  if (S.lastKill) {
    const { killer, victim } = S.lastKill;
    setTimeout(() => hud.callout(`FINAL BLOW — ${killer.name} ▸ ${victim.name} • ${pick(CALLOUTS.finalBlow)}`), 750);
  }
  const voice = bots.find((b) => b.team === 'ember' && b.alive) ?? bots.find((b) => b.team === 'ember');
  if (voice) {
    S.radioFreeAt = 0;
    say(voice, winner === 'ember' ? 'roundWin' : 'roundLose', {});
  }
  if (matchPoint) {
    const mp = bots.find((b) => b.team === 'ember' && b.alive);
    if (mp) setTimeout(() => { S.radioFreeAt = 0; say(mp, winner === 'ember' ? 'matchPointUs' : 'matchPointThem', {}); }, 2600);
  }
}

function endMatch() {
  S.phase = 'matchEnd';
  player.enabled = false;
  if (document.pointerLockElement) document.exitPointerLock();
  const won = S.scoreE > S.scoreA;
  const acc = S.stats.shots > 0 ? Math.round((S.stats.hits / S.stats.shots) * 100) : 0;
  hud.showEnd(won ? 'EMBER TAKES THE YARD' : 'THE ASHEN KEEP THE FORGE', `
    <table>
      <tr><td>Final score</td><td class="v">Ember ${S.scoreE} — ${S.scoreA} Ashen</td></tr>
      <tr><td>Your kills</td><td class="v">${S.stats.kills}</td></tr>
      <tr><td>Your deaths</td><td class="v">${S.stats.deaths}</td></tr>
      <tr><td>Charges planted</td><td class="v">${S.stats.plants}</td></tr>
      <tr><td>Trigger accuracy</td><td class="v">${acc}%</td></tr>
    </table>`);
  sfx.sting(won);
}

function resetMatch() {
  S.scoreE = 0;
  S.scoreA = 0;
  S.round = 1;
  S.money = MATCH.startMoney;
  S.stats = { kills: 0, deaths: 0, plants: 0, shots: 0, hits: 0 };
  player.wasAliveLastRound = false;
  coach.resetMatch();
  startBuy();
}

// ---------- buying ----------

function ownedSet() {
  const owned = new Set([player.weaponId]);
  if (player.armour) owned.add('armour');
  if (player.grenades > 0) owned.add('grenade');
  if (player.flashes > 0) owned.add('flash');
  return owned;
}

function refreshBuy() {
  hud.refreshBuy(S.money, ownedSet());
}

function tryBuy(id) {
  const def = WEAPONS[id] ?? GEAR[id];
  if (!def || S.money < def.price) { sfx.denied(); return; }
  if (WEAPONS[id]) {
    if (player.weaponId === id) { sfx.denied(); return; }
    S.money -= def.price;
    player.giveWeapon(id);
  } else if (id === 'armour') {
    if (player.armour) { sfx.denied(); return; }
    S.money -= def.price;
    player.armour = true;
  } else if (id === 'grenade') {
    if (player.grenades >= 2) { sfx.denied(); return; }
    S.money -= def.price;
    player.grenades += 1;
  } else if (id === 'flash') {
    if (player.flashes >= 2) { sfx.denied(); return; }
    S.money -= def.price;
    player.flashes += 1;
  }
  sfx.buy();
  hud.setWallet(S.money);
  refreshBuy();
}
hud.onBuy = tryBuy;

// ---------- projectiles (player-thrown gear) ----------

function throwGear(kind) {
  const isNade = kind === 'grenade';
  if (isNade && player.grenades <= 0) return;
  if (!isNade && player.flashes <= 0) return;
  if (isNade) player.grenades -= 1; else player.flashes -= 1;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 8),
    new THREE.MeshStandardMaterial({ color: isNade ? 0xb33030 : 0xd8d8e0, emissive: isNade ? 0x801111 : 0x555560, roughness: 0.5 }),
  );
  const origin = player.eyePos();
  const dir = player.aimDir();
  mesh.position.copy(origin).add(dir.clone().multiplyScalar(0.5));
  scene.add(mesh);
  S.projectiles.push({
    kind, mesh,
    vel: dir.multiplyScalar(15).add(new THREE.Vector3(0, 3.2, 0)),
    fuse: isNade ? 1.5 : 0.9,
  });
}

function explodeGear(p) {
  const pos = p.mesh.position.clone();
  scene.remove(p.mesh);
  if (p.kind === 'grenade') {
    effects.sparks(pos, 46, 0xff7a30, 6, 3.4);
    effects.ringAt(pos, 0xff8a3c);
    effects.flash(pos, 2.2, 42);
    sfx.grenade();
    for (const f of fighters) {
      if (!f.alive || f === player) continue;
      const d = Math.hypot(f.pos.x - pos.x, f.pos.z - pos.z);
      if (d < GEAR.grenade.radius && f.team === 'ashen') {
        const dmg = GEAR.grenade.damage * (1 - (d / GEAR.grenade.radius) * 0.65);
        const wasAlive = f.alive;
        f.takeDamage(dmg, player, S.now);
        if (wasAlive && !f.alive) onKill(player, f, 'Pop Charge');
      }
    }
    const dp = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
    if (player.alive && dp < 2.4) player.takeDamage(24, pos);
  } else {
    effects.flash(pos, 2.6, 50);
    sfx.flashPop();
    for (const bot of bots) {
      if (!bot.alive || bot.team === 'ember') continue;
      const d = Math.hypot(bot.pos.x - pos.x, bot.pos.z - pos.z);
      if (d > 17 || !losClear(bot.pos.x, bot.pos.z, pos.x, pos.z)) continue;
      const f = bot.forward();
      const dot = (f.x * (pos.x - bot.pos.x) + f.z * (pos.z - bot.pos.z)) / (d || 1);
      if (dot > 0.15) bot.blindUntil = S.now + GEAR.flash.blindSeconds * Math.min(1, dot + 0.3);
    }
    const dp = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
    if (dp < 17) {
      const dir = player.aimDir();
      const dot = (dir.x * (pos.x - player.pos.x) + dir.z * (pos.z - player.pos.z)) / (dp || 1);
      if (dot > 0.5) S.flashTime = 1.5;
    }
  }
}

function updateProjectiles(dt) {
  for (let i = S.projectiles.length - 1; i >= 0; i--) {
    const p = S.projectiles[i];
    p.fuse -= dt;
    p.vel.y -= 17 * dt;
    p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
    if (p.mesh.position.y < 0.12) {
      p.mesh.position.y = 0.12;
      p.vel.y *= -0.38;
      p.vel.x *= 0.7; p.vel.z *= 0.7;
    }
    if (p.fuse <= 0) {
      S.projectiles.splice(i, 1);
      explodeGear(p);
    }
  }
}

// ---------- per-frame director ----------

const botCtx = {
  get now() { return S.now; },
  get noise() { return S.noise; },
  enemiesOf,
  allBots: bots,
  onBotShoot: (bot, target) => resolveBotShoot(bot, target),
  onRetreat: (bot) => say(bot, 'retreat', {}),
  onChannelDone: (bot, kind) => {
    if (kind === 'plant') plantCharge(bot);
    else if (kind === 'defuse') defuseCharge();
  },
};

const prevKeys = new Set();
function keyPressed(code) {
  return player.keys.has(code) && !prevKeys.has(code);
}

function directLive(dt) {
  S.now += dt;

  // The clock.
  if (S.planted) {
    S.chargeTimer -= dt;
    if (S.chargeTimer <= 0) { detonateCharge(); return; }
    if (S.now >= S.nextBeep) {
      S.nextBeep = S.now + Math.max(0.22, (S.chargeTimer / MATCH.chargeSeconds) * 0.95);
      sfx.plantBeep(false);
    }
  } else {
    S.roundClock -= dt;
    if (S.roundClock <= 0) { endRound('ashen', 'time'); return; }
  }

  // A death the killfeed never saw (the player's own grenade) still counts.
  if (!player.alive && !S.playerDeathHandled) {
    S.playerDeathHandled = true;
    S.stats.deaths += 1;
    dropCharge(player);
    checkElimination();
    if (S.phase !== 'live') return;
  }

  // Charge logistics: pickups, bot plant and defuse starts.
  const charge = S.charge;
  if (charge.state === 'dropped') {
    let nearest = null;
    let nearestD = Infinity;
    for (const f of fighters) {
      if (!f.alive || f.team !== 'ember') continue;
      const d = Math.hypot(f.pos.x - charge.pos.x, f.pos.z - charge.pos.z);
      if (d < 1.35) {
        charge.state = 'carried';
        charge.carrier = f;
        nearest = null;
        break;
      }
      if (!f.isPlayer && d < nearestD) { nearestD = d; nearest = f; }
    }
    if (nearest && charge.state === 'dropped') {
      nearest.setObjective(nearestNode(charge.pos.x, charge.pos.z));
    }
  }
  if (charge.state === 'carried' && charge.carrier && !charge.carrier.isPlayer && charge.carrier.alive) {
    const c = charge.carrier;
    if (Math.hypot(c.pos.x - SITE.x, c.pos.z - SITE.z) < SITE.r - 0.6 && !c.channel) {
      c.setObjective(18);
      c.startChannel('plant', MATCH.plantSeconds);
      say(c, 'plantStart', {});
    } else if (!c.channel) {
      c.setObjective(18);
    }
  }
  if (S.planted) {
    let defuser = null;
    for (const bot of bots) {
      if (bot.team !== 'ashen' || !bot.alive) continue;
      if (bot.channel && bot.channel.kind === 'defuse') defuser = bot;
    }
    if (!defuser) {
      let best = null; let bestD = Infinity;
      for (const bot of bots) {
        if (bot.team !== 'ashen' || !bot.alive) continue;
        const d = Math.hypot(bot.pos.x - SITE.x, bot.pos.z - SITE.z);
        if (d < bestD) { bestD = d; best = bot; }
      }
      if (best) {
        best.setObjective(18);
        if (bestD < 1.7 && !best.channel) {
          best.startChannel('defuse', MATCH.defuseSeconds);
          if (!S.defuseWarned) {
            S.defuseWarned = true;
            coach.onDefuseThreat();
            const voice = bots.find((b) => b.team === 'ember' && b.alive);
            if (voice) { S.radioFreeAt = 0; say(voice, 'defuseStart', {}); }
          }
        }
      }
      for (const bot of bots) {
        if (bot.team === 'ashen' && bot.alive && bot !== best) bot.setObjective(16);
      }
    }
  }

  // Player planting: hold E inside the ring with the charge in hand.
  const playerInSite = Math.hypot(player.pos.x - SITE.x, player.pos.z - SITE.z) < SITE.r;
  if (player.alive && charge.state === 'carried' && charge.carrier === player && playerInSite && player.keys.has('KeyE')) {
    world.setRingMode('planting');
    S.plantProgress += dt / MATCH.plantSeconds;
    hud.plantProgress(S.plantProgress, 'PLANTING THE SPARK');
    if (S.plantProgress >= 1) {
      S.plantProgress = 0;
      hud.plantProgress(null);
      plantCharge(player);
    }
  } else if (S.plantProgress > 0) {
    S.plantProgress = 0;
    hud.plantProgress(null);
    if (!S.planted) world.setRingMode('idle');
  }

  // Gear throws.
  if (player.alive && keyPressed('KeyG')) throwGear('grenade');
  if (player.alive && keyPressed('KeyF')) throwGear('flash');

  // Bots think and move.
  for (const bot of bots) bot.update(dt, botCtx);

  // Contact callouts, throttled by the radio helper.
  for (const bot of bots) {
    if (bot.target && !bot.hadTarget && bot.alive && rand() < 0.45) {
      say(bot, 'contact', { lane: laneName(bot.pos.x), foe: bot.target.name });
    }
    bot.hadTarget = !!bot.target;
  }

  updateProjectiles(dt);

  // Charge prop follows its story.
  if (charge.state === 'carried' && charge.carrier) {
    chargeMesh.visible = true;
    chargeMesh.position.set(charge.carrier.pos.x, 2.05 + Math.sin(S.now * 3) * 0.06, charge.carrier.pos.z);
    chargeMesh.rotation.y += dt * 2.4;
  } else if (charge.state === 'dropped') {
    chargeMesh.visible = true;
    chargeMesh.position.set(charge.pos.x, 0.5 + Math.sin(S.now * 3) * 0.08, charge.pos.z);
    chargeMesh.rotation.y += dt * 2.4;
  } else if (charge.state === 'planted') {
    chargeMesh.visible = true;
    chargeMesh.position.set(charge.pos.x, 0.35, charge.pos.z);
    chargeMesh.material.emissiveIntensity = 1.6 + Math.sin(S.now * 11) * 1.2;
  } else {
    chargeMesh.visible = false;
  }

  // HUD clock + vitals.
  hud.setClock(S.planted ? S.chargeTimer : S.roundClock, S.planted);
  hud.setPlayer(player.hp, player.armour, player.def.name, player.ammo, player.reserve,
    player.grenades, player.flashes, charge.state === 'carried' && charge.carrier === player);

  // Flash blindness fades.
  if (S.flashTime > 0) {
    S.flashTime -= dt;
    hud.flash(Math.max(0, Math.min(0.96, S.flashTime / 1.1)));
  }

  // The coach's marker rides on top of everything.
  coach.update({
    phase: S.planted ? 'planted' : 'live',
    planted: S.planted,
    chargePos: charge.pos,
    sitePos: { x: SITE.x, z: SITE.z, y: 1.4 },
    carrierPos: charge.state === 'carried' && charge.carrier && !charge.carrier.isPlayer ? charge.carrier.pos : null,
    carrierName: charge.state === 'carried' && charge.carrier ? charge.carrier.name : '',
    playerHasCharge: charge.state === 'carried' && charge.carrier === player,
    playerAlive: player.alive,
  });
}

function snapshotKeys() {
  prevKeys.clear();
  for (const k of player.keys) prevKeys.add(k);
}

// ---------- boot, title & input wiring ----------

document.getElementById('startBtn').addEventListener('click', () => {
  sfx.wake();
  hud.hideStart();
  resetMatch();
  renderer.domElement.requestPointerLock();
});
document.getElementById('againBtn').addEventListener('click', () => {
  sfx.wake();
  hud.hideEnd();
  resetMatch();
  renderer.domElement.requestPointerLock();
});
document.addEventListener('keydown', (e) => {
  sfx.wake();
  if (S.phase === 'buy') {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 8) tryBuy(BUY_ROWS[n - 1].id);
    if (e.code === 'KeyB' || e.code === 'Enter') startLive();
  } else if (S.phase === 'live' && e.code === 'KeyB') {
    // Mid-round B re-opens the shop only in spawn safety: keep it simple, no-op.
  }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Fighters staged at their spawns behind the title screen.
resetRound();
hud.setScore(0, 0, 1);
hud.showStart();

const clockT = new THREE.Clock();
let titleAngle = 0.6;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clockT.getDelta());

  if (S.phase === 'title') {
    titleAngle += dt * 0.05;
    camera.position.set(Math.sin(titleAngle) * 24, 8.5, Math.cos(titleAngle) * 24);
    camera.lookAt(0, 1.5, -6);
    chargeMesh.visible = false;
    for (const bot of bots) bot.group.rotation.y = bot.yaw + Math.sin(S.now + bot.pos.x) * 0.04;
    S.now += dt;
  } else if (S.phase === 'buy') {
    S.now += dt;
    S.phaseTimer -= dt;
    hud.showBuy(S.phaseTimer);
    player.update(dt);
    if (S.phaseTimer <= 0) startLive();
  } else if (S.phase === 'live') {
    player.update(dt);
    directLive(dt);
    if (!player.alive) {
      // Corpse cam: sink and roll where the player fell.
      camera.position.y = Math.max(0.55, camera.position.y - dt * 1.6);
      camera.rotation.z = Math.min(0.45, camera.rotation.z + dt * 0.5);
    }
  } else if (S.phase === 'roundEnd') {
    S.now += dt;
    S.phaseTimer -= dt;
    player.update(dt);
    // The round is decided: bots may walk and fall, but nobody keeps shooting.
    const quietCtx = { ...botCtx, onBotShoot: () => {} };
    for (const bot of bots) bot.update(dt, quietCtx);
    if (S.phaseTimer <= 0) {
      if (S.scoreE >= MATCH.roundsToWin || S.scoreA >= MATCH.roundsToWin) endMatch();
      else { S.round += 1; startBuy(); }
    }
  } else if (S.phase === 'matchEnd') {
    S.now += dt;
    titleAngle += dt * 0.04;
    camera.position.set(Math.sin(titleAngle) * 20, 7, Math.cos(titleAngle) * 20);
    camera.lookAt(0, 1.5, -8);
  }

  world.update(dt);
  effects.update(dt);
  hud.update(dt);
  snapshotKeys();
  renderer.render(scene, camera);
}

// ---------- staged screenshots ----------
// ?shot=start|buy|play|end&seed=n freezes one deterministic frame of the real
// game for the maker's camera: same seed, same yard, same frame, every run.

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');

function stageShot(name) {
  const seed = parseInt(params.get('seed') ?? '1', 10) || 1;
  seedRandom(seed * 7919 + 13);
  hud.hideStart();

  if (name === 'start') {
    hud.showStart();
    camera.position.set(13.5, 5.2, 14.5);
    camera.lookAt(0, 1.6, -9);
    chargeMesh.visible = false;
    return;
  }

  if (name === 'buy') {
    S.money = 2650;
    resetRound();
    S.phase = 'buy';
    player.giveWeapon('forgeline');
    player.armour = true;
    player.grenades = 1;
    hud.setPlayer(100, true, 'Forgeline', player.ammo, player.reserve, player.grenades, player.flashes, false);
    hud.setWallet(S.money);
    hud.showBuy(11);
    refreshBuy();
    coach.onBuyPhase(1);
    camera.position.set(player.pos.x, 1.62, player.pos.z);
    camera.rotation.set(0, 0, 0);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = Math.PI;
    return;
  }

  if (name === 'play') {
    resetRound();
    S.phase = 'live';
    S.scoreE = 2; S.scoreA = 1; S.round = 3;
    hud.setScore(2, 1, 3);
    player.giveWeapon('forgeline');
    player.pos.set(-2.6, 0, 5.5);
    player.yaw = Math.PI + 0.35;
    player.pitch = -0.02;
    player.hp = 72;
    player.armour = true;
    player.ammo = 24;
    player.reserve = 90;
    const place = (bot, x, z, yaw) => { bot.pos.set(x, 0, z); bot.yaw = yaw; bot.group.rotation.y = yaw; };
    const ember = bots.filter((b) => b.team === 'ember');
    const ashen = bots.filter((b) => b.team === 'ashen');
    place(ember[0], -6.5, 2.5, Math.PI + 0.4);
    place(ember[1], 3.8, -1.5, Math.PI - 0.3);
    place(ember[2], -1.5, -6.5, Math.PI + 0.1);
    place(ember[3], 7.5, 7.5, Math.PI - 0.5);
    place(ashen[0], -1.2, -13.8, 0.2);
    place(ashen[1], 5.5, -10.5, -0.4);
    place(ashen[2], -9.5, -8, 0.5);
    place(ashen[3], 1.8, -3.2, 0);
    ashen[3].alive = false;
    ashen[3].state = 'dead';
    ashen[3].deathTimer = 1;
    ashen[3].group.rotation.x = -Math.PI / 2 * 0.92;
    ashen[3].group.position.y = -0.12;
    if (ashen[3].nameSprite) ashen[3].nameSprite.visible = false;
    place(ashen[4], 12, -13, -0.3);
    S.charge.state = 'carried';
    S.charge.carrier = player;
    hud.killfeed('Vex', 'Hollow', 'Forgeline', 'ember', 'ashen');
    hud.killfeed('Thorn', 'Marlo', 'Cinder', 'ashen', 'ember');
    hud.radio('Asha', 'Contact — Furnace Row! Eyes on the site!', 'ember');
    hud.setClock(47, false);
    hud.setWallet(3400);
    hud.setPlayer(72, true, 'Forgeline', 24, 90, 1, 1, true);
    player.update(0);
    const muzzle = player.muzzlePos();
    const targetChest = ashen[0].chestPos();
    effects.tracer(muzzle, targetChest, 0xffc37a);
    effects.sparks(targetChest, 8, 0xff5030);
    effects.update(0.02);
    coach.update({
      phase: 'live', planted: false, chargePos: S.charge.pos,
      sitePos: { x: SITE.x, z: SITE.z, y: 1.4 },
      carrierPos: null, carrierName: '', playerHasCharge: true, playerAlive: true,
    });
    return;
  }

  if (name === 'end') {
    resetRound();
    S.phase = 'matchEnd';
    S.scoreE = 5; S.scoreA = 3;
    hud.setScore(5, 3, 8);
    S.stats = { kills: 9, deaths: 4, plants: 2, shots: 210, hits: 97 };
    const ember = bots.filter((b) => b.team === 'ember');
    const spots = [[-3, -12.5], [2.5, -11], [0.5, -14.5], [-6, -9]];
    ember.forEach((bot, i) => {
      bot.pos.set(spots[i][0], 0, spots[i][1]);
      bot.yaw = 0.4 - i * 0.25;
      bot.group.rotation.y = bot.yaw;
    });
    const ashen = bots.filter((b) => b.team === 'ashen');
    ashen[0].alive = false;
    ashen[0].state = 'dead';
    ashen[0].deathTimer = 1;
    ashen[0].pos.set(4.5, 0, -6);
    ashen[0].group.rotation.x = -Math.PI / 2 * 0.92;
    ashen[0].group.position.y = -0.12;
    if (ashen[0].nameSprite) ashen[0].nameSprite.visible = false;
    for (let i = 1; i < ashen.length; i++) ashen[i].group.visible = false;
    effects.emberFountain(new THREE.Vector3(SITE.x, 0.6, SITE.z));
    for (let i = 0; i < 10; i++) effects.update(0.16);
    const acc = Math.round((S.stats.hits / S.stats.shots) * 100);
    hud.showEnd('EMBER TAKES THE YARD', `
      <table>
        <tr><td>Final score</td><td class="v">Ember 5 — 3 Ashen</td></tr>
        <tr><td>Your kills</td><td class="v">${S.stats.kills}</td></tr>
        <tr><td>Your deaths</td><td class="v">${S.stats.deaths}</td></tr>
        <tr><td>Charges planted</td><td class="v">${S.stats.plants}</td></tr>
        <tr><td>Trigger accuracy</td><td class="v">${acc}%</td></tr>
      </table>`);
    camera.position.set(9.5, 3.6, -2);
    camera.lookAt(0, 1.6, -13);
    chargeMesh.visible = false;
    return;
  }
}

if (shotName) {
  stageShot(shotName);
  world.update(0.4);
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  window.__shotReady = true;
} else {
  frame();
}
