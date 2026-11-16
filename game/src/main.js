// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. main.js owns the combat ray, the damage, the plant/defuse
// progress, the grenades and the round wiring; the modules own their own jobs.
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createWorld, SITES, areaName } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponSystem, WEAPONS, GRENADE, FLASH, ARMOR } from './weapons.js';
import { createBots } from './bots.js';
import { createMatch, PLANT_SECONDS, DEFUSE_SECONDS, WIN_ROUNDS } from './rounds.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createCoach } from './coach.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color('#33200f'), 28, 82);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene);
const audio = createAudio();
const match = createMatch();
const bots = createBots(scene, world, random);
const player = createPlayer(world.colliders);
const weapons = createWeaponSystem(camera);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 110;

const hud = createHud({
  onBuy: (index, kind) => buyItem(index, kind),
});
const coach = createCoach();

// The player as an actor the bots can see and shoot: position and velocity are
// live getters over the movement state.
const playerState = {
  hp: 100,
  armor: 0,
  alive: true,
  grenades: 0,
  flashes: 0,
  name: 'You',
};
const playerActor = {
  isPlayer: true,
  team: 'ember',
  name: 'You',
  get alive() {
    return playerState.alive;
  },
  get position() {
    return player.state.position;
  },
  get velocity() {
    return player.state.velocity;
  },
};
const botActors = bots.bots.map((bot) => ({
  isPlayer: false,
  team: bot.team,
  name: bot.name,
  bot,
  get alive() {
    return bot.alive;
  },
  get position() {
    return bot.body.position;
  },
  get velocity() {
    return bot.body.velocity;
  },
}));
const actors = [playerActor, ...botActors];
const shootTargets = world.shootables.concat(bots.hitMeshes);

// Throwable pool: two live throwables at most, meshes reused. A slot holds
// either a Spark grenade (accent) or a Flash Charge (pale) — the emissive
// colour is set at throw time.
const grenadePool = [];
for (let i = 0; i < 2; i += 1) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.8, roughness: 0.4 }),
  );
  mesh.visible = false;
  scene.add(mesh);
  grenadePool.push({ mesh, velocity: new THREE.Vector3(), fuse: 0, active: false, bounces: 0, kind: 'spark' });
}
let grenadeNext = 0;

const body = player.state;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const rayOrigin = new THREE.Vector3();
const rayDir = new THREE.Vector3();

let started = false;
let paused = false;
let frozen = false;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let plantActor = null;
let defuseActor = null;
let beepTimer = 0;
let overlayTimer = -1;
let spectateBot = null;
let trauma = 0;
let noiseAt = null;

function aliveCounts() {
  return {
    ember: (playerState.alive ? 1 : 0) + bots.aliveCount('ember'),
    ashen: bots.aliveCount('ashen'),
  };
}

function carrierName() {
  if (!playerState.alive) {
    const carrier = bots.carrier();
    return carrier ? carrier.name : null;
  }
  return 'You';
}

function resetPlayer() {
  body.position.set(0, 0, 15.5);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  playerState.hp = 100;
  playerState.alive = true;
  playerState.grenades = 0;
  playerState.flashes = 0;
  spectateBot = null;
  weapons.refillAmmo();
  hud.setSpectate(null);
  hud.setHealth(100, playerState.armor);
}

// The round banner tells the state of the match, not just the phase: the
// score, who leads, and whether the next round settles it.
function roundBanner() {
  const { round, score } = match.state;
  const firstTo = WIN_ROUNDS;
  let sub = 'Buy phase — B to shop';
  if (score.ember === firstTo - 1 && score.ashen === firstTo - 1) sub = 'Match point — the next round takes the yard';
  else if (score.ember === firstTo - 1) sub = 'Match point, Ember — close it out';
  else if (score.ashen === firstTo - 1) sub = 'Match point, Ashen — win this or lose the yard';
  else if (score.ember > score.ashen) sub = `Ember leads ${score.ember} — ${score.ashen} · buy phase`;
  else if (score.ashen > score.ember) sub = `Ashen leads ${score.ashen} — ${score.ember} · buy phase`;
  else if (round > 1) sub = `Level at ${score.ember} — ${score.ashen} · buy phase`;
  hud.banner(`Round ${round}`, sub, '', 2400);
}

function startRoundAll() {
  match.startRound();
  resetPlayer();
  bots.spawnRound(match.state);
  hud.hideBuy();
  hud.setObjective('Buy phase — press B to shop');
  roundBanner();
  if (!shot) hud.showBuy(match.state.money, (i) => weapons.has(i));
}

function startMatchAll() {
  match.startMatch();
  playerState.armor = 0;
  weapons.reset();
  startRoundAll();
}

function buyItem(index, kind) {
  if (match.state.phase !== 'buy') return;
  if (kind === 'weapon') {
    const def = WEAPONS[index];
    if (weapons.has(index)) {
      weapons.select(index);
      return;
    }
    if (!match.spend(def.price)) {
      audio.denied();
      return;
    }
    weapons.buy(index);
    weapons.select(index);
    audio.buy();
  } else if (kind === 'grenade') {
    if (playerState.grenades >= 2) return;
    if (!match.spend(GRENADE.price)) {
      audio.denied();
      return;
    }
    playerState.grenades += 1;
    audio.buy();
  } else if (kind === 'armor') {
    if (playerState.armor >= 50) return;
    if (!match.spend(ARMOR.price)) {
      audio.denied();
      return;
    }
    playerState.armor = ARMOR.value;
    audio.buy();
  } else if (kind === 'flash') {
    if (playerState.flashes >= 2) return;
    if (!match.spend(FLASH.price)) {
      audio.denied();
      return;
    }
    playerState.flashes += 1;
    audio.buy();
  }
  hud.setMoney(match.state.money);
  hud.showBuy(match.state.money, (i) => weapons.has(i));
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    paused = false;
    audio.unlock();
    hud.hideOverlay();
    hud.hideBuy();
    if (match.state.phase === 'buy') hud.showBuy(match.state.money, (i) => weapons.has(i));
  } else if (started && playerState.alive && match.state.phase !== 'over' && !match.state.matchWinner) {
    paused = true;
    hud.hideBuy();
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (match.state.matchWinner) {
    startMatchAll();
    input.requestLock();
    return;
  }
  if (match.state.phase === 'over') {
    advanceRound();
    input.requestLock();
    return;
  }
  input.requestLock();
});

function advanceRound() {
  if (match.state.matchWinner) return;
  match.nextRound();
  resetPlayer();
  bots.spawnRound(match.state);
  hud.hideOverlay();
  hud.hideBuy();
  hud.setObjective('Buy phase — press B to shop');
  roundBanner();
  if (!shot) hud.showBuy(match.state.money, (i) => weapons.has(i));
}

match.on({
  onPhase(phase) {
    if (phase === 'live') {
      hud.hideBuy();
      hud.setObjective(carrierName() === 'You' ? 'Plant the Spark at Relay A or Relay B' : `${carrierName()} carries the Spark — cover them`);
    } else if (phase === 'planted') {
      const site = match.state.plant.site;
      world.charge.position.set(SITES[site].center.x, 0.3, SITES[site].center.z);
      world.charge.visible = true;
      hud.banner('Spark planted', `${SITES[site].name} — fuse ${35}s`, 'ember', 3000);
      hud.setObjective(`Spark planted at ${SITES[site].name} — defend it`);
      audio.plant();
    }
  },
  onRoundEnd(winner, reason) {
    if (reason === 'Spark detonated') effects.detonate(world.charge.position);
    world.charge.visible = false;
    hud.hideProgress();
    hud.hideBuy();
    hud.setObjective('Round over');
    if (winner === 'ember') {
      hud.banner('Round to Ember', reason, 'ember', 3200);
      audio.roundWin();
    } else {
      hud.banner('Round to Ashen', reason, 'ashen', 3200);
      audio.roundLose();
    }
    if (document.pointerLockElement) document.exitPointerLock();
    overlayTimer = 1.6;
  },
  onMatchEnd(winner) {
    hud.setObjective(winner === 'ember' ? 'Ember takes the match' : 'Ashen takes the match');
  },
});

// Ray-sphere test for bot shots at the player (and bot targets): returns the
// nearest distance along the ray, or Infinity. Reuses the module temps.
function raySphere(origin, dir, center, radius) {
  tmpA.subVectors(center, origin);
  const tca = tmpA.dot(dir);
  if (tca < 0) return Infinity;
  const d2 = tmpA.lengthSq() - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return Infinity;
  return tca - Math.sqrt(r2 - d2);
}

function resolveShot(origin, dir, def, shooter) {
  // World first: the nearest surface caps the shot.
  raycaster.set(origin, dir);
  raycaster.far = 110;
  const worldHit = raycaster.intersectObjects(world.shootables, false)[0];
  const worldDist = worldHit ? worldHit.distance : 110;

  if (shooter.isPlayer) {
    // The player's ray reads the bots' own hit meshes, head included.
    const hits = raycaster.intersectObjects(shootTargets, false);
    const hit = hits[0];
    if (hit && hit.distance < worldDist) {
      const actor = hit.object.userData.actor;
      if (actor) {
        applyDamage(actor.bot ? botActorOf(actor) : actor, def, hit.distance, hit.object.userData.part || 'torso', shooter);
        return { point: hit.point, hitActor: true, hitTeam: actor.team };
      }
    }
    if (worldHit) return { point: worldHit.point, hitActor: false, normal: worldHit.face?.normal };
    return { point: tmpA.copy(origin).addScaledVector(dir, 80), hitActor: false };
  }

  // A bot's ray: world first, then spheres on its target only.
  const target = shooter.targetActor;
  if (!target || !target.alive) {
    if (worldHit) return { point: worldHit.point, hitActor: false };
    return { point: tmpA.copy(origin).addScaledVector(dir, 80), hitActor: false };
  }
  const p = target.position;
  const spheres = [
    { y: p.y + 1.5, r: 0.17, part: 'head' },
    { y: p.y + 1.08, r: 0.45, part: 'torso' },
    { y: p.y + 0.45, r: 0.32, part: 'legs' },
  ];
  let best = Infinity;
  let bestPart = 'torso';
  for (const s of spheres) {
    tmpB.set(p.x, s.y, p.z);
    const t = raySphere(origin, dir, tmpB, s.r);
    if (t < best) {
      best = t;
      bestPart = s.part;
    }
  }
  if (best < worldDist) {
    const point = tmpA.copy(origin).addScaledVector(dir, best);
    // The muzzle position rides along so the coach can show the player which
    // direction the hit came from.
    applyDamage(target, def, best, bestPart, { ...shooter, pos: origin });
    return { point, hitActor: true, hitTeam: target.team };
  }
  if (worldHit) return { point: worldHit.point, hitActor: false };
  return { point: tmpA.copy(origin).addScaledVector(dir, 80), hitActor: false };
}

function botActorOf(bot) {
  return botActors.find((a) => a.bot === bot) || null;
}

function applyDamage(target, def, distance, part, shooter) {
  if (!target || !target.alive) return;
  const range = def.range ?? 60;
  const falloff = def.falloff ?? 1;
  const headMult = def.headMult ?? 1;
  let amount = def.damage;
  if (distance > range * 0.5) {
    amount *= falloff + (1 - falloff) * Math.max(0, 1 - (distance - range * 0.5) / (range * 0.5));
  }
  if (part === 'head') amount *= headMult;
  else if (part === 'legs') amount *= 0.75;

  const shooterName = shooter.isPlayer ? 'You' : shooter.name;
  if (target.isPlayer) {
    let remaining = amount;
    if (playerState.armor > 0) {
      const absorbed = Math.min(playerState.armor, remaining * 0.5);
      playerState.armor -= absorbed;
      remaining -= absorbed;
    }
    playerState.hp -= remaining;
    hud.damageFlash();
    if (shooter.pos) coach.damageFrom(shooter.pos, body.position, body.yaw);
    audio.hurt();
    trauma = Math.min(1, trauma + 0.25);
    if (playerState.hp <= 0) {
      playerState.hp = 0;
      playerState.alive = false;
      match.addDeath();
      hud.killfeed(shooterName, shooter.team, 'You', 'ember', part === 'head');
      hud.setSpectate(null);
      const alive = bots.bots.filter((b) => b.team === 'ember' && b.alive);
      spectateBot = alive.length ? alive[Math.floor(random() * alive.length)] : null;
      if (spectateBot) hud.setSpectate(spectateBot.name);
      // The Spark passes to a living Ember bot, who will carry it to a site.
      if (alive.length) {
        const next = alive[Math.floor(random() * alive.length)];
        for (const b of bots.bots) if (b.team === 'ember') b.isCarrier = false;
        next.isCarrier = true;
      }
      if (document.pointerLockElement) document.exitPointerLock();
    }
    hud.setHealth(playerState.hp, playerState.armor);
    return;
  }

  const killed = bots.damage(target.bot, amount);
  if (shooter.isPlayer) {
    hud.hitMarker(killed, killed ? 400 : 120);
    if (killed) audio.kill();
    else audio.hit();
  }
  if (killed) {
    hud.killfeed(shooterName, shooter.team, target.name, target.team, part === 'head');
    if (shooter.team === 'ember') match.addKill('ember');
    if (shooter.isPlayer) trauma = Math.min(1, trauma + 0.1);
  }
}

function fireShot(origin, dir, def, shooter) {
  const result = resolveShot(origin, dir, def, shooter);
  muzzle.copy(origin).addScaledVector(dir, 0.5);
  effects.tracer(muzzle, result.point);
  if (shooter.isPlayer) effects.puff(muzzle, 1, { size: 0.32, life: 0.7, strength: 0.22, rise: 0.5, spread: 0.25 });
  if (result.hitActor) {
    // A burst in the victim's team colour where the round landed.
    effects.hitBurst(result.point, result.hitTeam);
  } else {
    // The ray stopped on the world (or flew past it): sparks where it ended.
    const dist = origin.distanceTo(result.point);
    if (dist < 100) {
      tmpB.copy(dir).negate();
      effects.sparksAt(result.point, tmpB, 6);
    }
  }
  noiseAt = { x: origin.x, z: origin.z };
}

function playerShoot() {
  const def = weapons.def();
  if (!weapons.takeRound()) {
    audio.dry();
    return;
  }
  weapons.pullTrigger();
  audio.shot(def.kind);
  camera.getWorldDirection(direction);
  const spread = weapons.spread(player.groundSpeed());
  const pellets = def.pellets || 1;
  for (let i = 0; i < pellets; i += 1) {
    rayDir.copy(direction);
    rayDir.x += (random() * 2 - 1) * spread;
    rayDir.y += (random() * 2 - 1) * spread;
    rayDir.z += (random() * 2 - 1) * spread;
    rayDir.normalize();
    rayOrigin.copy(camera.position);
    fireShot(rayOrigin, rayDir, def, { isPlayer: true, team: 'ember', name: 'You' });
  }
  player.recoil(def.kick + random() * 0.004, (random() * 2 - 1) * 0.004);
  trauma = Math.min(1, trauma + def.kind === 'sniper' ? 0.35 : 0.12);
  hud.setAmmo(weapons.mag(), weapons.reserve(), def.name);
}

function throwThrowable(kind) {
  if (!playerState.alive) return;
  if (match.state.phase !== 'live' && match.state.phase !== 'planted') return;
  if (kind === 'spark') {
    if (playerState.grenades <= 0) return;
    playerState.grenades -= 1;
  } else {
    if (playerState.flashes <= 0) return;
    playerState.flashes -= 1;
  }
  const g = grenadePool[grenadeNext];
  grenadeNext = (grenadeNext + 1) % grenadePool.length;
  g.kind = kind;
  const tint = new THREE.Color(kind === 'spark' ? PALETTE.accent : PALETTE.ink);
  g.mesh.material.color.copy(tint);
  g.mesh.material.emissive.copy(tint);
  camera.getWorldDirection(direction);
  g.mesh.position.copy(camera.position).addScaledVector(direction, 0.5);
  g.velocity.copy(direction).multiplyScalar(17);
  g.velocity.y += 3.5;
  g.velocity.add(player.state.velocity);
  g.fuse = 1.5;
  g.bounces = 0;
  g.active = true;
  g.mesh.visible = true;
  audio.shot('pistol', true);
}

// The Flash Charge pops: no damage, but every bot caught looking at it in
// the open loses its eyes for a few seconds — and the player whites out if
// they were watching it too.
function explodeFlash(g) {
  g.active = false;
  g.mesh.visible = false;
  const point = g.mesh.position;
  effects.flashBurst(point);
  audio.flash();
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const eye = tmpA.set(bot.body.position.x, bot.body.position.y + 1.5, bot.body.position.z);
    const dist = eye.distanceTo(point);
    if (dist > FLASH.radius) continue;
    raycaster.set(eye, tmpB.subVectors(point, eye).normalize());
    raycaster.far = dist;
    const blocked = raycaster.intersectObjects(world.shootables, false)[0];
    raycaster.far = 110;
    if (blocked && blocked.distance < dist - 0.4) continue;
    const facing = tmpB.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    const toFlash = new THREE.Vector3(point.x - eye.x, 0, point.z - eye.z).normalize();
    const dot = facing.dot(toFlash);
    if (dot < -0.25) continue;
    bots.blind(bot, FLASH.blind * (dot > 0.4 ? 1 : 0.55) * (1 - dist / (FLASH.radius * 1.6)));
  }
  const camDir = camera.getWorldDirection(new THREE.Vector3());
  const toFlash = new THREE.Vector3().subVectors(point, camera.position);
  const distP = toFlash.length();
  if (distP < 14 && camDir.dot(toFlash.normalize()) > 0.25) {
    hud.whiteFlash(1 - distP / 18);
  }
}

function explodeGrenade(g) {
  g.active = false;
  g.mesh.visible = false;
  const point = g.mesh.position;
  effects.explosion(point);
  audio.explosion();
  trauma = Math.min(1, trauma + 0.5);
  for (const actor of actors) {
    if (!actor.alive) continue;
    const dist = Math.hypot(actor.position.x - point.x, actor.position.z - point.z)
      + Math.abs(actor.position.y + 1 - point.y) * 0.5;
    if (dist > GRENADE.radius) continue;
    const amount = GRENADE.damage * (1 - (dist / GRENADE.radius) * 0.7);
    if (actor.isPlayer) {
      applyDamage(actor, { damage: amount, range: 99, falloff: 1, headMult: 1 }, 0, 'torso', { isPlayer: false, team: 'ashen', name: 'Spark' });
    } else {
      const killed = bots.damage(actor.bot, amount);
      if (killed) {
        hud.killfeed('You', 'ember', actor.name, actor.team, false);
        match.addKill('ember');
        audio.kill();
      }
    }
  }
}

function stepGrenades(dt) {
  for (const g of grenadePool) {
    if (!g.active) continue;
    g.fuse -= dt;
    g.velocity.y -= 14 * dt;
    const next = tmpA.copy(g.mesh.position).addScaledVector(g.velocity, dt);
    // Bounce: try each axis alone against the world, like the body mover.
    const probe = new THREE.Box3();
    const hits = (x, y, z) => {
      probe.min.set(x - 0.1, y - 0.1, z - 0.1);
      probe.max.set(x + 0.1, y + 0.1, z + 0.1);
      for (const c of world.colliders) if (probe.intersectsBox(c)) return true;
      return false;
    };
    if (!hits(next.x, g.mesh.position.y, g.mesh.position.z)) g.mesh.position.x = next.x;
    else {
      g.velocity.x *= -0.45;
      g.bounces += 1;
    }
    if (!hits(g.mesh.position.x, g.mesh.position.y, next.z)) g.mesh.position.z = next.z;
    else {
      g.velocity.z *= -0.45;
      g.bounces += 1;
    }
    if (!hits(g.mesh.position.x, next.y, g.mesh.position.z) && next.y > 0.09) g.mesh.position.y = next.y;
    else {
      g.velocity.y *= -0.4;
      g.bounces += 1;
      if (g.mesh.position.y < 0.09) g.mesh.position.y = 0.09;
    }
    if (g.fuse <= 0 || g.bounces > 3) {
      if (g.kind === 'flash') explodeFlash(g);
      else explodeGrenade(g);
    }
  }
}

function nearSite() {
  for (const key of ['A', 'B']) {
    const site = SITES[key];
    const d = Math.hypot(body.position.x - site.center.x, body.position.z - site.center.z);
    if (d < site.radius) return key;
  }
  return null;
}

function stepPlantDefuse(dt) {
  const phase = match.state.phase;
  const keys = input.state.keys;
  let planting = null;
  let defusing = null;

  if (phase === 'live' && playerState.alive && keys.has('KeyE')) {
    const site = nearSite();
    if (site) planting = { actor: 'player', site };
  }
  if (phase === 'planted' && playerState.alive) {
    const site = match.state.plant.site;
    const d = Math.hypot(body.position.x - SITES[site].center.x, body.position.z - SITES[site].center.z);
    if (d < 2.5 && keys.has('KeyE')) defusing = { actor: 'player', site };
  }
  // Bots plant and defuse on their own clocks.
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    if (bot.planting && phase === 'live') planting = { actor: bot, site: bot.plantSite };
    if (bot.defusing && phase === 'planted') defusing = { actor: bot, site: match.state.plant.site };
  }
  // Nobody left to stop a defuse: it runs on its own.
  if (phase === 'planted' && aliveCounts().ember === 0 && !defusing) {
    defusing = { actor: 'auto', site: match.state.plant.site };
  }

  if (planting) {
    if (plantActor !== planting.actor) {
      plantActor = planting.actor;
      match.state.plant.progress = 0;
    }
    match.state.plant.progress += dt;
    const frac = match.state.plant.progress / PLANT_SECONDS;
    hud.showProgress(plantActor === 'player' ? 'Planting the Spark…' : `${plantActor.name} is planting…`, frac);
    if (match.state.plant.progress >= PLANT_SECONDS) {
      match.plantAt(planting.site);
      plantActor = null;
      hud.hideProgress();
    }
  } else {
    if (plantActor) {
      match.state.plant.progress = 0;
      plantActor = null;
    }
    if (phase === 'live') hud.hideProgress();
  }

  if (defusing) {
    if (defuseActor !== defusing.actor) {
      defuseActor = defusing.actor;
      match.state.plant.defuse = 0;
    }
    match.state.plant.defuse += dt;
    const frac = match.state.plant.defuse / DEFUSE_SECONDS;
    if (defusing.actor !== 'auto') {
      hud.showProgress(defuseActor === 'player' ? 'Defusing the Spark…' : `${defuseActor.name} is defusing…`, frac);
    }
    if (match.state.plant.defuse >= DEFUSE_SECONDS) {
      match.defused();
      defuseActor = null;
      hud.hideProgress();
    }
  } else if (phase === 'planted') {
    if (defuseActor) {
      match.state.plant.defuse = 0;
      defuseActor = null;
    }
    hud.hideProgress();
  }
}

function syncCamera() {
  if (!playerState.alive && spectateBot) {
    const bot = spectateBot;
    camera.position.set(bot.body.position.x, bot.body.position.y + 1.55, bot.body.position.z);
    camera.rotation.set(0, bot.yaw, 0, 'YXZ');
    return;
  }
  const shake = trauma * trauma * 0.02;
  camera.position.set(
    body.position.x + (random() * 2 - 1) * shake,
    body.position.y + body.eye + (random() * 2 - 1) * shake,
    body.position.z,
  );
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function step(dt) {
  elapsed += dt;
  trauma = Math.max(0, trauma - dt * 1.6);
  const phase = match.state.phase;

  if (!shot) {
    const look = input.takeLook();
    if (playerState.alive && (phase === 'buy' || phase === 'live' || phase === 'planted') && !paused) {
      player.look(look.x, look.y);
    }
    // While paused, drop stale one-shot keys so nothing fires on resume.
    if (paused) input.takePressed();
  }

  if (!paused) {
    if (playerState.alive && (phase === 'buy' || phase === 'live' || phase === 'planted')) {
      player.step(dt, input.state.keys);
      if (!shot && input.state.firing && weapons.ready()) playerShoot();
      if (input.state.keys.has('KeyR') && weapons.reload()) audio.reload();
    }
    if (!shot) {
      const pressed = input.takePressed();
      if (pressed.has('KeyB') && phase === 'buy') {
        if (hud.buyOpen()) hud.hideBuy();
        else hud.showBuy(match.state.money, (i) => weapons.has(i));
      }
      if (pressed.has('KeyG')) throwThrowable('spark');
      if (pressed.has('KeyQ')) throwThrowable('flash');
      for (let i = 0; i < 5; i += 1) {
        if (pressed.has(`Digit${i + 1}`)) {
          if (phase === 'buy') buyItem(i, 'weapon');
          else weapons.select(i);
        }
      }
      if (pressed.has('Digit6') && phase === 'buy') buyItem(5, 'grenade');
      if (pressed.has('Digit7') && phase === 'buy') buyItem(6, 'armor');
      if (pressed.has('Digit8') && phase === 'buy') buyItem(7, 'flash');
    }

    if (phase === 'live' || phase === 'planted') {
      bots.step(dt, elapsed, {
        actors,
        raycaster,
        match: match.state,
        noiseAt,
        onCallout: (name, team, text) => hud.callout(name, team, text),
        combat: {
          shoot(origin, dir, def, shooterBot) {
            // The bot's target is already an actor wrapper from ctx.actors,
            // so it rides along for the sphere test as it is.
            fireShot(origin, dir, def, {
              isPlayer: false, team: shooterBot.team, name: shooterBot.name, targetActor: shooterBot.target || null,
            });
            audio.shot(def.kind, true);
          },
        },
      });
      noiseAt = null;
    }

    stepPlantDefuse(dt);
    stepGrenades(dt);
    match.update(dt, aliveCounts());
    // The planted site's ring runs the alarm pulse while its Spark is live.
    world.setPlanted(match.state.plant.planted ? match.state.plant.site : null);
    world.step(dt, elapsed);
    effects.step(dt);

    if (match.state.phase === 'planted') {
      beepTimer -= dt;
      if (beepTimer <= 0) {
        audio.beep(match.state.plant.fuse < 10);
        beepTimer = match.state.plant.fuse < 10 ? 0.5 : 1;
        world.chargeLight.intensity = match.state.plant.fuse < 10 ? 14 : 7;
      }
    }
    if (overlayTimer > 0) {
      overlayTimer -= dt;
      if (overlayTimer <= 0) {
        overlayTimer = -1;
        if (match.state.matchWinner) {
          hud.showOverlay('match', { winner: match.state.matchWinner, ember: match.state.score.ember, ashen: match.state.score.ashen });
        } else if (match.state.phase === 'over') {
          hud.showOverlay('round', { winner: match.state.winner, reason: match.state.reason, ember: match.state.score.ember, ashen: match.state.score.ashen });
        }
      }
    }
  if (match.roundOver() && !match.state.matchWinner && !shot) advanceRound();
}

  // HUD, every step — each setter guards on change.
  hud.setHealth(playerState.hp, playerState.armor);
  hud.setAmmo(weapons.mag(), weapons.reserve(), `${weapons.def().name}${playerState.grenades > 0 ? ` · ✦${playerState.grenades}` : ''}${playerState.flashes > 0 ? ` · ✧${playerState.flashes}` : ''}`);
  hud.setMoney(match.state.money);
  hud.setTimer(match.state.timer, match.state.phase);
  hud.setScore(match.state.score.ember, match.state.score.ashen, match.state.round);
  hud.setCrosshairSpread(4 + weapons.spread(player.groundSpeed()) * 900);
  hud.setArea(areaName(body.position.x, body.position.z));
  const emberRoster = [{ name: 'You', hp: Math.ceil(playerState.hp), alive: playerState.alive, isPlayer: true, isCarrier: carrierName() === 'You' }];
  for (const bot of bots.bots) {
    if (bot.team !== 'ember') continue;
    emberRoster.push({ name: bot.name, hp: Math.ceil(bot.health), alive: bot.alive, isPlayer: false, isCarrier: bot.isCarrier && bot.alive });
  }
  const ashenRoster = bots.bots.filter((b) => b.team === 'ashen')
    .map((b) => ({ name: b.name, hp: Math.ceil(b.health), alive: b.alive, isPlayer: false, isCarrier: false }));
  hud.setRoster(emberRoster, ashenRoster);
  if (match.state.phase === 'live' || match.state.phase === 'planted') {
    if (match.state.phase === 'live') {
      hud.setObjective(carrierName() === 'You' ? 'Plant the Spark at Relay A or Relay B' : `${carrierName() || '—'} carries the Spark — cover them`);
    }
  }

  // The coach: point at the round's objective, and in the first two rounds
  // name the one job of the moment. After that the marker stays but the words
  // stop — the player knows the game by then.
  const roundNow = match.state.round;
  if (phase === 'buy') {
    coach.setTarget(null);
    coach.hint(roundNow === 1 ? 'Buy phase — press B. A rifle and armour beat a bare pistol.' : '');
  } else if (phase === 'live') {
    if (carrierName() === 'You') {
      const a = SITES.A.center;
      const b = SITES.B.center;
      const da = Math.hypot(body.position.x - a.x, body.position.z - a.z);
      const db = Math.hypot(body.position.x - b.x, body.position.z - b.z);
      const site = da <= db ? 'A' : 'B';
      const c = SITES[site].center;
      coach.setTarget({ x: c.x, y: 1.4, z: c.z }, `RELAY ${site}`);
      coach.hint(roundNow <= 2 ? 'Follow the amber diamond — hold E at the Relay to plant the Spark.' : '');
    } else {
      const carrier = bots.carrier();
      if (carrier) coach.setTarget({ x: carrier.body.position.x, y: 1.9, z: carrier.body.position.z }, `COVER ${carrier.name.toUpperCase()}`);
      else coach.setTarget(null);
      coach.hint(roundNow <= 2 ? 'Your team-mate carries the Spark — stay close and cover them.' : '');
    }
  } else if (phase === 'planted') {
    const c = SITES[match.state.plant.site].center;
    coach.setTarget({ x: c.x, y: 1.2, z: c.z }, 'SPARK');
    coach.hint(roundNow <= 2 ? 'The Spark is live — hold the site until it blows.' : '');
  } else {
    coach.setTarget(null);
    coach.hint('');
  }
  coach.update(camera, body.position);

  weapons.step(dt);
  syncCamera();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    body.position.set(0, 0, 15.5);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.6, -2));
    hud.setObjective('Buy phase — press B to shop');
    hud.showOverlay('start');
  } else if (name === 'buy') {
    // The shop, mid-decision: a rifle already owned, grenade and vest in the
    // bag, enough left for a Flash Charge — the menu tells the economy story.
    match.state.money = 2450;
    weapons.buy(2);
    playerState.grenades = 1;
    playerState.flashes = 1;
    playerState.armor = 50;
    body.position.set(0, 0, 15.5);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.6, -2));
    hud.setObjective('Buy phase — press B to shop');
    hud.showBuy(match.state.money, (i) => weapons.has(i));
  } else if (name === 'play') {
    match.state.phase = 'live';
    match.state.timer = 62;
    match.state.score.ember = 1;
    match.state.score.ashen = 0;
    match.state.round = 2;
    body.position.set(-3, 0, 4);
    settle(20);
    // Two Ashen bots hold mid; the player fires one burst at the nearer one.
    const ashen = bots.bots.filter((b) => b.team === 'ashen');
    ashen[0].body.position.set(-7, 0, -6);
    ashen[0].yaw = Math.PI;
    ashen[1].body.position.set(3, 0, -8);
    ashen[1].yaw = Math.PI;
    ashen[0].parts.group.position.copy(ashen[0].body.position);
    ashen[1].parts.group.position.copy(ashen[1].body.position);
    // The player rolls kitted: a Longbow in hand, vest, one of each throwable.
    // A teammate holds the left lane in frame.
    weapons.buy(2);
    weapons.select(2);
    weapons.refillAmmo();
    playerState.armor = 50;
    playerState.grenades = 1;
    playerState.flashes = 1;
    const vex = bots.bots.find((b) => b.team === 'ember');
    vex.body.position.set(-8.5, 0, 0.5);
    vex.parts.group.position.copy(vex.body.position);
    vex.routeIndex = vex.route.length;
    vex.state = 'hold';
    vex.hold = { at: [-8.5, 0.5], face: [0, -10] };
    settle(6);
    aimAt(new THREE.Vector3(-7, 1.3, -6));
    playerShoot();
    settle(2);
    hud.setObjective('Plant the Spark at Relay A or Relay B');
  } else {
    match.state.phase = 'over';
    match.state.timer = 0;
    match.state.score.ember = 2;
    match.state.score.ashen = 1;
    match.state.round = 3;
    match.state.winner = 'ember';
    match.state.reason = 'Spark detonated';
    match.state.plant.site = 'A';
    match.state.plant.planted = true;
    world.charge.position.set(SITES.A.center.x, 0.3, SITES.A.center.z);
    world.charge.visible = true;
    body.position.set(-13, 0, -7);
    settle(20);
    aimAt(new THREE.Vector3(-16, 0.6, -11));
    // The story of the round in one frame: a fallen Ashen by the ring, and
    // the Spark going up — fireball, shockwave and sparks, caught mid-burst.
    const fallen = bots.bots.find((b) => b.team === 'ashen');
    fallen.body.position.set(-13.6, 0, -8.9);
    fallen.parts.group.position.copy(fallen.body.position);
    bots.damage(fallen, 999);
    effects.detonate(new THREE.Vector3(SITES.A.center.x, 0.35, SITES.A.center.z));
    settle(4);
    // The round's story in the margins: the feed and the radio remember it.
    const ashenNames = bots.bots.filter((b) => b.team === 'ashen').map((b) => b.name);
    const emberMate = bots.bots.find((b) => b.team === 'ember');
    hud.killfeed('You', 'ember', ashenNames[0], 'ashen', true);
    if (emberMate && ashenNames[1]) hud.killfeed(emberMate.name, 'ember', ashenNames[1], 'ashen', false);
    if (emberMate) hud.callout(emberMate.name, 'ember', 'Spark is live — hold the ring!');
    hud.banner('Round to Ember', 'Spark detonated', 'ember', 60000);
    hud.setObjective('Spark detonated — round to Ember');
  }
  hud.setHealth(playerState.hp, playerState.armor);
  hud.setAmmo(weapons.mag(), weapons.reserve(), weapons.def().name);
  hud.setMoney(match.state.money);
  hud.setTimer(match.state.timer, match.state.phase);
  hud.setScore(match.state.score.ember, match.state.score.ashen, match.state.round);
  hud.setArea(areaName(body.position.x, body.position.z));
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    coach.update(camera, body.position);
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

startMatchAll();
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
