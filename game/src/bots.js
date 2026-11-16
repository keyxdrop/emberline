// The bots: nine of them, four Ember teammates and five Ashen defenders. Each
// bot is a small state machine — route, hold, engage, plant, defuse, retake —
// walking waypoint routes, holding site angles, and reacting to what it sees
// and hears. Perception is a staggered line-of-sight check against the world's
// shootables; aim error grows with distance and target speed, and fire comes
// in bursts with pauses, so a still, aiming bot is dangerous and a spraying
// one is not. main.js owns the ray and the damage; bots only decide and ask.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMover } from './physics.js';
import { ROUTES, HOLDS, SPAWNS, SITES, areaName } from './world.js';
import { range } from './rng.js';

const EMBER_NAMES = ['Vex', 'Mara', 'Juno', 'Kett'];
const ASHEN_NAMES = ['Rook', 'Sable', 'Ivo', 'Nyx', 'Dain'];
const HEALTH = 100;
const RADIUS = 0.34;
const HEIGHT = 1.72;
const EYE = 1.55;
const SEE_INTERVAL = 0.12;
const SEE_RANGE = 42;
const FOV_COS = 0.42;

const BOT_GUNS = {
  pistol: { kind: 'pistol', damage: 24, headMult: 4, range: 45, falloff: 0.55, fireGap: 0.22, burst: 2, pause: 0.7, error: 0.03 },
  smg: { kind: 'smg', damage: 20, headMult: 4, range: 38, falloff: 0.5, fireGap: 0.1, burst: 5, pause: 0.55, error: 0.028 },
  rifle: { kind: 'rifle', damage: 30, headMult: 4, range: 70, falloff: 0.7, fireGap: 0.13, burst: 4, pause: 0.65, error: 0.02 },
};

// Radio chatter, by situation. A bot calls what it sees, where it sees it;
// the lines are flavour with a job — they tell the player (and anyone reading
// a screenshot) that the yard is being fought over by a team, not targets.
const CALLOUTS = {
  contact: ['Contact — {area}!', 'Eyes on — {area}!', 'Hostile, {area}!', 'There — {area}!'],
  plant: ['Spark going down — cover me!', 'Planting! Watch my back!', 'Spark is going in!'],
  defuse: ['Cutting the Spark — hold them off!', 'On the Spark — keep them back!', 'Defusing, cover me!'],
  hurt: ["I'm hit!", 'Taking fire!', 'Hit — falling back!'],
  blind: ['Flashed — I can\'t see!', 'My eyes! Blind!'],
  hold: ['Holding {area}.', 'Set at {area}.', 'Watching {area}.'],
};

function buildBotMesh(team) {
  const group = new THREE.Group();
  const teamColor = team === 'ember' ? PALETTE.accent : PALETTE.ashen;
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.6, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#211a12'), roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a582'), roughness: 0.7 });
  const glowStrip = new THREE.MeshStandardMaterial({
    color: new THREE.Color(teamColor), emissive: new THREE.Color(teamColor), emissiveIntensity: 1.5, roughness: 0.4,
  });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.78, 0.16), dark);
  legL.position.set(-0.11, 0.39, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.28), cloth);
  torso.position.y = 1.09;
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), skin);
  head.position.y = 1.56;
  head.userData.part = 'head';
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), cloth);
  visor.position.set(0, 1.58, -0.13);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.52), dark);
  gun.position.set(0.16, 1.28, -0.28);
  // Kit: a pack on the back, pads on the shoulders, a lit team stripe on the
  // chest — enough silhouette that a teammate reads at a glance, at range.
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.16), dark);
  pack.position.set(0, 1.12, 0.22);
  const padL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.3), dark);
  padL.position.set(-0.34, 1.36, 0);
  const padR = padL.clone();
  padR.position.x = 0.34;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.02), glowStrip);
  stripe.position.set(0, 1.24, -0.15);
  const kneeL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.14, 0.05), cloth);
  kneeL.position.set(-0.11, 0.42, -0.09);
  const kneeR = kneeL.clone();
  kneeR.position.x = 0.11;
  group.add(legL, legR, torso, head, visor, gun, pack, padL, padR, stripe, kneeL, kneeR);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return { group, legL, legR, torso, head, gun };
}

export function createBots(scene, world, random) {
  const mover = createMover(world.colliders);
  const bots = [];
  const hitMeshes = [];
  const forward = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const eyePos = new THREE.Vector3();
  const targetPos = new THREE.Vector3();
  const aimDir = new THREE.Vector3();

  function makeBot(team, index, name) {
    const parts = buildBotMesh(team);
    scene.add(parts.group);
    const bot = {
      id: `${team}-${index}`,
      name,
      team,
      isPlayer: false,
      body: { position: new THREE.Vector3(), velocity: new THREE.Vector3(), onGround: true },
      yaw: 0,
      pitch: 0,
      health: HEALTH,
      armor: 0,
      alive: true,
      gun: BOT_GUNS.pistol,
      route: [],
      routeIndex: 0,
      hold: null,
      state: 'route',
      target: null,
      lastSeen: new THREE.Vector3(),
      lastSeenAt: -99,
      reaction: 0,
      burstLeft: 0,
      burstPause: 0,
      fireCooldown: 0,
      seeTimer: random() * SEE_INTERVAL,
      thinkTimer: 0,
      stuckTimer: 0,
      lastPos: new THREE.Vector3(),
      plantSite: null,
      isCarrier: false,
      planting: false,
      defusing: false,
      blinded: 0,
      retreated: false,
      saidPlant: false,
      saidDefuse: false,
      saidBlind: false,
      saidHold: false,
      hurtCalled: false,
      investigate: null,
      investigateAt: -99,
      speed: range(random, 3.4, 4.2),
      walkPhase: random() * 6,
      parts,
      hitMeshes: [parts.torso, parts.head],
    };
    parts.torso.userData.actor = bot;
    parts.head.userData.actor = bot;
    hitMeshes.push(parts.torso, parts.head);
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < EMBER_NAMES.length; i += 1) makeBot('ember', i, EMBER_NAMES[i]);
  for (let i = 0; i < ASHEN_NAMES.length; i += 1) makeBot('ashen', i, ASHEN_NAMES[i]);

  // Chatter is rationed: one callout at a time across the whole yard, and
  // never two inside two seconds, or the feed turns into noise.
  let lastCalloutAt = -99;
  function callout(bot, time, ctx, kind, area) {
    if (!ctx.onCallout || time - lastCalloutAt < 2) return;
    const lines = CALLOUTS[kind];
    if (!lines) return;
    lastCalloutAt = time;
    const line = lines[Math.floor(random() * lines.length)].replace('{area}', area || areaName(bot.body.position.x, bot.body.position.z));
    ctx.onCallout(bot.name, bot.team, line);
  }

  function faceToward(bot, x, z) {
    const dx = x - bot.body.position.x;
    const dz = z - bot.body.position.z;
    if (Math.abs(dx) + Math.abs(dz) < 0.01) return;
    bot.yaw = Math.atan2(-dx, -dz);
  }

  function setRoute(bot, points) {
    bot.route = points.map(([x, z]) => new THREE.Vector3(x, 0, z));
    bot.routeIndex = 0;
    bot.state = 'route';
  }

  function spawnRound(match) {
    const emberRoutes = ['emberAWest', 'emberAMid', 'emberBEast', 'emberBMid'];
    const ashenPlan = [
      { route: 'ashenA', hold: HOLDS.A1 },
      { route: 'ashenA', hold: HOLDS.A2 },
      { route: 'ashenB', hold: HOLDS.B1 },
      { route: 'ashenB', hold: HOLDS.B2 },
      { route: 'ashenMid', hold: HOLDS.Mid },
    ];
    const emberBots = bots.filter((b) => b.team === 'ember');
    const ashenBots = bots.filter((b) => b.team === 'ashen');
    const gunFor = (round) => (round <= 1 ? BOT_GUNS.pistol : round <= 2 ? BOT_GUNS.smg : BOT_GUNS.rifle);
    // Ember: two to A, two to B (one each via mid). The Spark starts with the
    // player; when the player falls it passes to a living Ember bot (main.js).
    emberBots.forEach((bot, i) => {
      const spawn = SPAWNS.ember[i % SPAWNS.ember.length];
      bot.body.position.set(spawn[0], 0, spawn[1]);
      bot.body.velocity.set(0, 0, 0);
      bot.health = HEALTH;
      bot.armor = 0;
      bot.alive = true;
      bot.gun = gunFor(match.round);
      bot.isCarrier = false;
      bot.plantSite = null;
      bot.planting = false;
      bot.defusing = false;
      bot.blinded = 0;
      bot.retreated = false;
      bot.saidPlant = false;
      bot.saidDefuse = false;
      bot.saidBlind = false;
      bot.saidHold = false;
      bot.hurtCalled = false;
      bot.target = null;
      bot.investigate = null;
      bot.parts.group.rotation.set(0, 0, 0);
      bot.parts.group.position.copy(bot.body.position);
      bot.parts.group.visible = true;
      const routeKey = emberRoutes[(i + Math.floor(random() * 2)) % emberRoutes.length];
      const site = routeKey.includes('A') ? 'A' : 'B';
      bot.plantSite = site;
      setRoute(bot, ROUTES[routeKey]);
      bot.hold = null;
      faceToward(bot, 0, -10);
    });
    ashenBots.forEach((bot, i) => {
      const spawn = SPAWNS.ashen[i % SPAWNS.ashen.length];
      bot.body.position.set(spawn[0], 0, spawn[1]);
      bot.body.velocity.set(0, 0, 0);
      bot.health = HEALTH;
      bot.armor = 0;
      bot.alive = true;
      bot.gun = gunFor(match.round);
      bot.isCarrier = false;
      bot.plantSite = null;
      bot.planting = false;
      bot.defusing = false;
      bot.blinded = 0;
      bot.retreated = false;
      bot.saidPlant = false;
      bot.saidDefuse = false;
      bot.saidBlind = false;
      bot.saidHold = false;
      bot.hurtCalled = false;
      bot.target = null;
      bot.investigate = null;
      bot.parts.group.rotation.set(0, 0, 0);
      bot.parts.group.position.copy(bot.body.position);
      bot.parts.group.visible = true;
      const plan = ashenPlan[i];
      setRoute(bot, ROUTES[plan.route]);
      bot.hold = plan.hold;
      faceToward(bot, 0, 10);
    });
  }

  // Line of sight: a ray from the bot's eye to the target's chest; blocked when
  // a world surface is closer than the target.
  function canSee(bot, actor, raycaster) {
    eyePos.set(bot.body.position.x, bot.body.position.y + EYE, bot.body.position.z);
    targetPos.set(actor.position.x, actor.position.y + 1.25, actor.position.z);
    toTarget.subVectors(targetPos, eyePos);
    const dist = toTarget.length();
    if (dist > SEE_RANGE) return false;
    forward.copy(toTarget).normalize();
    const facing = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    if (forward.dot(facing) < FOV_COS && dist > 3) return false;
    raycaster.set(eyePos, forward);
    raycaster.far = dist;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    raycaster.far = 110;
    return !hit || hit.distance >= dist - 0.3;
  }

  function nearestVisible(bot, actors, raycaster) {
    let best = null;
    let bestDist = Infinity;
    for (const actor of actors) {
      if (!actor.alive || actor.team === bot.team) continue;
      const dx = actor.position.x - bot.body.position.x;
      const dz = actor.position.z - bot.body.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= bestDist) continue;
      if (!canSee(bot, actor, raycaster)) continue;
      best = actor;
      bestDist = dist;
    }
    return best;
  }

  function moveToward(bot, dt, x, z, speed) {
    const dx = x - bot.body.position.x;
    const dz = z - bot.body.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) {
      bot.body.velocity.x *= Math.max(0, 1 - 9 * dt);
      bot.body.velocity.z *= Math.max(0, 1 - 9 * dt);
      return true;
    }
    const s = Math.min(speed, dist * 4);
    bot.body.velocity.x += ((dx / dist) * s - bot.body.velocity.x) * Math.min(1, 10 * dt);
    bot.body.velocity.z += ((dz / dist) * s - bot.body.velocity.z) * Math.min(1, 10 * dt);
    bot.body.velocity.y -= 20 * dt;
    mover.move(bot.body, dt, RADIUS, HEIGHT);
    return dist < 0.6;
  }

  function stepBot(bot, dt, time, ctx) {
    if (!bot.alive) return;
    bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
    bot.burstPause = Math.max(0, bot.burstPause - dt);
    bot.reaction = Math.max(0, bot.reaction - dt);
    bot.blinded = Math.max(0, bot.blinded - dt);
    bot.thinkTimer -= dt;

    // Perception, staggered so nine bots never raycast on the same step.
    // A flashed bot sees nothing at all until the timer runs out.
    bot.seeTimer -= dt;
    if (bot.seeTimer <= 0 && bot.blinded <= 0) {
      bot.seeTimer = SEE_INTERVAL + random() * 0.05;
      const seen = nearestVisible(bot, ctx.actors, ctx.raycaster);
      if (seen) {
        if (bot.target !== seen) {
          bot.reaction = range(random, 0.35, 0.7);
          if (random() < 0.55) callout(bot, time, ctx, 'contact', areaName(seen.position.x, seen.position.z));
        }
        bot.target = seen;
        bot.lastSeen.copy(seen.position);
        bot.lastSeenAt = time;
      } else if (bot.target && time - bot.lastSeenAt > 1.5) {
        bot.target = null;
      }
    }

    const match = ctx.match;
    const planted = match.plant.planted;
    const plantSite = match.plant.site;

    // Objective overrides, decided about twice a second.
    if (bot.thinkTimer <= 0) {
      bot.thinkTimer = 0.5;
      bot.planting = false;
      bot.defusing = false;
      if (bot.hurtCalled) {
        bot.hurtCalled = false;
        callout(bot, time, ctx, 'hurt');
      }
      if (bot.blinded > 0 && !bot.saidBlind) {
        bot.saidBlind = true;
        callout(bot, time, ctx, 'blind');
      }
      // Wounded, carrying nothing and with no plant down: fall back toward
      // spawn and regroup, once a round. Bots at an objective stay and fight.
      if (!bot.retreated && bot.health <= 35 && !bot.isCarrier && !planted && bot.state !== 'defuse') {
        bot.retreated = true;
        const spawns = bot.team === 'ember' ? SPAWNS.ember : SPAWNS.ashen;
        const home = spawns[Math.floor(random() * spawns.length)];
        setRoute(bot, [[bot.body.position.x, bot.body.position.z], [home[0], home[1]]]);
        bot.hold = { at: [home[0], home[1]], face: [0, bot.team === 'ember' ? -10 : 10] };
      }
      if (bot.team === 'ashen' && planted && plantSite) {
        const site = SITES[plantSite];
        const dist = Math.hypot(site.center.x - bot.body.position.x, site.center.z - bot.body.position.z);
        if (dist < site.radius + 0.5) {
          bot.state = 'defuse';
          bot.defusing = true;
          if (!bot.saidDefuse) {
            bot.saidDefuse = true;
            callout(bot, time, ctx, 'defuse');
          }
        } else if (bot.state !== 'retake' && bot.state !== 'defuse') {
          const fromMid = Math.abs(bot.body.position.x) < 6;
          setRoute(bot, ROUTES[fromMid ? (plantSite === 'A' ? 'retakeAMid' : 'retakeBMid') : (plantSite === 'A' ? 'retakeA' : 'retakeB')]);
          bot.state = 'retake';
        }
      } else if (bot.team === 'ember' && bot.isCarrier && !planted && bot.routeIndex >= bot.route.length) {
        bot.state = 'plant';
        bot.planting = true;
        if (!bot.saidPlant) {
          bot.saidPlant = true;
          callout(bot, time, ctx, 'plant');
        }
      } else if (bot.team === 'ember' && planted && bot.isCarrier) {
        bot.state = 'hold';
        bot.hold = { at: [SITES[plantSite].center.x + 2, SITES[plantSite].center.z + 2], face: [0, 0] };
      }
    }

    // Movement and facing.
    const target = bot.target;
    const engaging = target && target.alive && time - bot.lastSeenAt < 1.5;
    if (bot.state === 'plant' || bot.state === 'defuse') {
      bot.body.velocity.x = 0;
      bot.body.velocity.z = 0;
      if (plantSite) faceToward(bot, SITES[plantSite].center.x, SITES[plantSite].center.z);
    } else if (engaging) {
      // Strafe slowly across the target's line while facing it; stop to shoot straight.
      faceToward(bot, target.position.x, target.position.z);
      const strafe = Math.sin(time * 0.9 + bot.walkPhase) * 1.1;
      const fx = -Math.sin(bot.yaw);
      const fz = -Math.cos(bot.yaw);
      const px = -fz;
      const pz = fx;
      bot.body.velocity.x += (px * strafe - bot.body.velocity.x) * Math.min(1, 6 * dt);
      bot.body.velocity.z += (pz * strafe - bot.body.velocity.z) * Math.min(1, 6 * dt);
      bot.body.velocity.y -= 20 * dt;
      mover.move(bot.body, dt, RADIUS, HEIGHT);
    } else if (bot.state === 'route' || bot.state === 'retake') {
      const wp = bot.route[bot.routeIndex];
      if (wp) {
        const arrived = moveToward(bot, dt, wp.x, wp.z, bot.speed);
        faceToward(bot, wp.x, wp.z);
        if (arrived) {
          bot.routeIndex += 1;
          if (bot.routeIndex >= bot.route.length) {
            if (bot.hold) {
              bot.state = 'hold';
            } else if (bot.team === 'ember' && bot.isCarrier && !planted) {
              bot.state = 'plant';
              bot.planting = true;
              if (!bot.saidPlant) {
                bot.saidPlant = true;
                callout(bot, time, ctx, 'plant');
              }
            } else {
              bot.state = 'hold';
              bot.hold = { at: [bot.body.position.x, bot.body.position.z], face: [0, -10] };
            }
            if (bot.state === 'hold' && !bot.saidHold) {
              bot.saidHold = true;
              if (random() < 0.4) callout(bot, time, ctx, 'hold');
            }
          }
        }
        // Stuck against a wall: skip to the next waypoint.
        const moved = Math.hypot(bot.body.position.x - bot.lastPos.x, bot.body.position.z - bot.lastPos.z);
        if (moved < 0.02 && bot.body.velocity.x * bot.body.velocity.x + bot.body.velocity.z * bot.body.velocity.z > 1) {
          bot.stuckTimer += dt;
          if (bot.stuckTimer > 1.2) {
            bot.routeIndex += 1;
            bot.stuckTimer = 0;
          }
        } else {
          bot.stuckTimer = 0;
        }
        bot.lastPos.copy(bot.body.position);
      }
    } else if (bot.state === 'hold' && bot.hold) {
      bot.body.velocity.x *= Math.max(0, 1 - 9 * dt);
      bot.body.velocity.z *= Math.max(0, 1 - 9 * dt);
      bot.body.velocity.y -= 20 * dt;
      mover.move(bot.body, dt, RADIUS, HEIGHT);
      faceToward(bot, bot.hold.face[0], bot.hold.face[1]);
      // A holding bot shuffles a step sideways now and then, to peek.
      if (Math.sin(time * 0.5 + bot.walkPhase) > 0.96) {
        moveToward(bot, dt, bot.hold.at[0] + 0.5, bot.hold.at[1], 1.2);
      }
    }

    // Hearing: a nearby gunshot pulls an idle bot toward the sound.
    if (ctx.noiseAt && !engaging && (bot.state === 'hold' || bot.state === 'route')) {
      const dx = ctx.noiseAt.x - bot.body.position.x;
      const dz = ctx.noiseAt.z - bot.body.position.z;
      if (Math.hypot(dx, dz) < 24 && time - bot.investigateAt > 5) {
        bot.investigate = { x: ctx.noiseAt.x, z: ctx.noiseAt.z };
        bot.investigateAt = time;
        bot.state = 'route';
        setRoute(bot, [[bot.body.position.x, bot.body.position.z], [ctx.noiseAt.x, ctx.noiseAt.z]]);
      }
    }

    // Fire: bursts with pauses, only once the reaction time has run out.
    if (engaging && bot.reaction <= 0 && bot.fireCooldown <= 0) {
      if (bot.burstLeft <= 0) {
        if (bot.burstPause <= 0) {
          bot.burstLeft = bot.gun.burst;
          bot.burstPause = range(random, 0.5, 0.95);
        }
      } else {
        bot.burstLeft -= 1;
        bot.fireCooldown = bot.gun.fireGap;
        eyePos.set(bot.body.position.x, bot.body.position.y + EYE, bot.body.position.z);
        const headshot = random() < 0.12;
        targetPos.set(
          target.position.x,
          target.position.y + (headshot ? 1.5 : 1.2),
          target.position.z,
        );
        aimDir.subVectors(targetPos, eyePos).normalize();
        const dist = eyePos.distanceTo(targetPos);
        const moving = Math.hypot(target.velocity?.x || 0, target.velocity?.z || 0);
        const error = bot.gun.error + dist * 0.0011 + Math.min(1, moving / 5) * 0.02;
        aimDir.x += (random() * 2 - 1) * error;
        aimDir.y += (random() * 2 - 1) * error;
        aimDir.z += (random() * 2 - 1) * error;
        aimDir.normalize();
        ctx.combat.shoot(eyePos, aimDir, bot.gun, bot);
      }
    }

    // Animate the mesh: position, facing, walk swing.
    const moving = Math.hypot(bot.body.velocity.x, bot.body.velocity.z);
    bot.walkPhase += dt * (2 + moving * 1.6);
    bot.parts.group.position.copy(bot.body.position);
    bot.parts.group.rotation.y = bot.yaw;
    const swing = moving > 0.5 ? Math.sin(bot.walkPhase * 2.4) * 0.35 : 0;
    bot.parts.legL.rotation.x = swing;
    bot.parts.legR.rotation.x = -swing;
    bot.parts.gun.position.y = 1.28 + Math.sin(bot.walkPhase * 2.4) * 0.012;
  }

  return {
    bots,
    hitMeshes,
    spawnRound,
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    carrier() {
      return bots.find((b) => b.team === 'ember' && b.isCarrier && b.alive) || null;
    },
    // A flash charge pops in the bot's face: it loses its target and its
    // eyes for `seconds`, and says so once. main.js checks range and facing.
    blind(bot, seconds) {
      if (!bot.alive) return;
      bot.blinded = Math.max(bot.blinded, seconds);
      bot.saidBlind = false;
      bot.target = null;
      bot.burstLeft = 0;
    },
    step(dt, time, ctx) {
      for (const bot of bots) stepBot(bot, dt, time, ctx);
      if (ctx.noiseAt) ctx.noiseAt = null;
    },
    damage(bot, amount) {
      if (!bot.alive) return false;
      let remaining = amount;
      if (bot.armor > 0) {
        const absorbed = Math.min(bot.armor, remaining * 0.5);
        bot.armor -= absorbed;
        remaining -= absorbed;
      }
      const before = bot.health;
      bot.health -= remaining;
      if (before > 40 && bot.health <= 40 && bot.health > 0) bot.hurtCalled = true;
      if (bot.health <= 0) {
        bot.health = 0;
        bot.alive = false;
        bot.planting = false;
        bot.defusing = false;
        bot.parts.group.rotation.x = -Math.PI / 2 + 0.12;
        bot.parts.group.position.y = 0.12;
        return true;
      }
      return false;
    },
    resetMeshes() {
      for (const bot of bots) {
        bot.parts.group.rotation.set(0, 0, 0);
        bot.parts.group.visible = true;
      }
    },
  };
}
