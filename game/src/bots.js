// bots.js — the nine other fighters. Each bot is a body (mesh, health, a gun
// from the same armoury the player buys from) and a small brain: perceive the
// nearest visible enemy, route along the waypoint graph to an objective the
// game assigns, engage in bursts at a preferred range, fall back when hurt,
// and channel the charge when its role demands it. Difficulty lives in one
// number the game passes in: a reaction scale that shrinks round by round.

import * as THREE from 'three';
import { WEAPONS, RAMP } from './config.js';
import { collide, losClear, nearestNode, findPath, nodePos } from './world.js';
import { rand, randRange } from './rng.js';

const TEAM_COLORS = {
  ember: { body: 0xb3491f, trim: 0xff7a2a, name: '#ffb37a' },
  ashen: { body: 0x46586e, trim: 0x9fb6cc, name: '#c3d5e8' },
};
const EYE_H = 1.52;
const CHEST_H = 1.25;

let nameSpriteFactory = null;
export function setNameSpriteFactory(fn) {
  nameSpriteFactory = fn;
}

export class Bot {
  constructor(scene, team, name) {
    this.team = team;
    this.name = name;
    this.isPlayer = false;
    this.group = new THREE.Group();
    this.pos = this.group.position; // feet, y stays 0
    this.yaw = team === 'ember' ? Math.PI : 0;
    this.hp = 100;
    this.alive = true;
    this.armour = false;
    this.weaponId = 'sidekick';
    this.ammo = 12;
    this.state = 'route';
    this.path = [];
    this.pathIdx = 0;
    this.objectiveNode = null;
    this.target = null;
    this.lastSeenAt = -99;
    this.lastSeenPos = new THREE.Vector3();
    this.perceiveTimer = Math.random() * 0.12;
    this.reactionTimer = 0;
    this.burstLeft = 0;
    this.burstWait = 0;
    this.fireTimer = 0;
    this.reloadTimer = 0;
    this.strafeDir = 1;
    this.strafeTimer = 0;
    this.channel = null; // { kind: 'plant'|'defuse', progress, seconds }
    this.fallbackCooldown = 0;
    this.lastHurtAt = -99;
    this.lastAttacker = null;
    this.deathTimer = 0;
    this.spokeRetreat = false;
    this.reactionScale = 1; // the game shrinks this for Ashen, round by round
    this.buildMesh(scene, team, name);
  }

  buildMesh(scene, team, name) {
    const c = TEAM_COLORS[team];
    const mat = new THREE.MeshStandardMaterial({ color: c.body, roughness: 0.8 });
    const trim = new THREE.MeshStandardMaterial({ color: c.trim, roughness: 0.5, emissive: c.trim, emissiveIntensity: 0.25 });
    this.bodyMat = mat;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), new THREE.MeshStandardMaterial({ color: 0x23211f, roughness: 0.95 }));
    legs.position.y = 0.36;
    this.group.add(legs);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), mat);
    torso.position.y = 1.08;
    torso.castShadow = true;
    this.group.add(torso);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.1, 0.36), trim);
    stripe.position.y = 1.32;
    this.group.add(stripe);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), new THREE.MeshStandardMaterial({ color: 0xc9a184, roughness: 0.7 }));
    head.position.y = 1.66;
    head.castShadow = true;
    this.group.add(head);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), trim);
    helm.position.y = 1.7;
    this.group.add(helm);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.62), new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.45, metalness: 0.6 }));
    gun.position.set(0.3, 1.28, -0.34);
    this.group.add(gun);
    this.gunMesh = gun;
    if (nameSpriteFactory) {
      this.nameSprite = nameSpriteFactory(name, c.name);
      this.nameSprite.position.y = 2.12;
      this.group.add(this.nameSprite);
    }
    scene.add(this.group);
  }

  get def() {
    return WEAPONS[this.weaponId];
  }

  eyePos() {
    return new THREE.Vector3(this.pos.x, EYE_H, this.pos.z);
  }

  chestPos() {
    return new THREE.Vector3(this.pos.x, CHEST_H, this.pos.z);
  }

  muzzlePos() {
    const f = this.forward();
    return new THREE.Vector3(this.pos.x + f.x * 0.62 + 0.3 * -f.z, 1.3, this.pos.z + f.z * 0.62 + 0.3 * f.x);
  }

  forward() {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  setLoadout(weaponId, armour) {
    this.weaponId = weaponId;
    this.armour = armour;
    this.ammo = this.def.mag;
    this.reloadTimer = 0;
    const s = weaponId === 'hailforge' ? 1.35 : weaponId === 'longspark' ? 1.2 : 1;
    this.gunMesh.scale.set(1, 1, s);
  }

  resetRound(spawn, weaponId, armour) {
    this.pos.set(spawn.x, 0, spawn.z);
    this.yaw = this.team === 'ember' ? Math.PI : 0;
    this.group.rotation.set(0, this.yaw, 0);
    this.hp = 100;
    this.alive = true;
    this.setLoadout(weaponId, armour);
    this.state = 'route';
    this.path = [];
    this.target = null;
    this.channel = null;
    this.spokeRetreat = false;
    this.fallbackCooldown = 0;
    this.group.visible = true;
    if (this.nameSprite) this.nameSprite.visible = true;
  }

  setObjective(nodeIdx) {
    if (this.objectiveNode === nodeIdx && this.path.length > 0) return;
    this.objectiveNode = nodeIdx;
    const from = nearestNode(this.pos.x, this.pos.z);
    this.path = findPath(from, nodeIdx);
    this.pathIdx = 0;
  }

  startChannel(kind, seconds) {
    this.channel = { kind, progress: 0, seconds };
    this.state = 'channel';
  }

  interruptChannel() {
    if (this.channel) {
      this.channel = null;
      this.state = 'route';
    }
  }

  takeDamage(amount, attacker, now) {
    if (!this.alive) return 0;
    const dealt = this.armour ? amount * 0.66 : amount;
    this.hp -= dealt;
    this.lastAttacker = attacker;
    this.lastHurtAt = now;
    this.bodyMat.emissive = new THREE.Color(0xff2222);
    this.bodyMat.emissiveIntensity = 0.55;
    if (this.channel && this.hp > 0) this.interruptChannel();
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.state = 'dead';
      this.channel = null;
      this.deathTimer = 0;
      if (this.nameSprite) this.nameSprite.visible = false;
    }
    return dealt;
  }

  // Preferred fighting distance by weapon: scatterguns close, DMRs far.
  preferredRange() {
    if (this.weaponId === 'bellows') return 9;
    if (this.weaponId === 'longspark') return 30;
    if (this.weaponId === 'sidekick') return 13;
    return 18;
  }

  perceive(enemies, now, noise) {
    let best = null;
    let bestD = Infinity;
    const eye = this.eyePos();
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d > 58 || d >= bestD) continue;
      const seen = d < 6.5 || losClear(eye.x, eye.z, e.pos.x, e.pos.z);
      const heard = noise && now - noise.at < 1.4 && Math.hypot(noise.x - this.pos.x, noise.z - this.pos.z) < 26 && noise.team !== this.team;
      if (!seen && !heard) continue;
      if (seen) { best = e; bestD = d; }
      else if (!best) { best = e; bestD = d; }
    }
    if (best) {
      const isNew = this.target !== best;
      this.target = best;
      this.lastSeenAt = now;
      this.lastSeenPos.set(best.pos.x, 0, best.pos.z);
      if (isNew) {
        this.reactionTimer = RAMP.baseReaction * this.reactionScale * randRange(0.8, 1.25);
        this.burstLeft = 0;
        this.burstWait = 0;
      }
    } else if (now - this.lastSeenAt > 3.5) {
      this.target = null;
    }
  }

  update(dt, ctx) {
    const now = ctx.now;
    if (!this.alive) {
      // Death: keel over and settle.
      this.deathTimer += dt;
      const k = Math.min(1, this.deathTimer / 0.45);
      this.group.rotation.x = -Math.PI / 2 * k * 0.92;
      this.group.position.y = -0.12 * k;
      return;
    }
    if (this.bodyMat.emissiveIntensity > 0) {
      this.bodyMat.emissiveIntensity = Math.max(0, this.bodyMat.emissiveIntensity - dt * 2.4);
    }
    if (now < (this.blindUntil ?? 0)) {
      // Blinded by a Flash Charge: stand, sway, see nothing, shoot nothing.
      this.yaw += dt * 0.7;
      this.group.rotation.y = this.yaw;
      return;
    }
    this.fallbackCooldown = Math.max(0, this.fallbackCooldown - dt);

    this.perceiveTimer -= dt;
    if (this.perceiveTimer <= 0) {
      this.perceiveTimer = 0.12;
      this.perceive(ctx.enemiesOf(this.team), now, ctx.noise);
    }

    if (this.channel) {
      this.channel.progress += dt;
      this.faceToward(this.team === 'ember' ? { x: 0, z: -22 } : { x: 0, z: 22 }, dt, 6);
      if (this.channel.progress >= this.channel.seconds) {
        const done = this.channel;
        this.channel = null;
        this.state = 'route';
        ctx.onChannelDone(this, done.kind);
      }
      return;
    }

    const visible = this.target && this.target.alive && now - this.lastSeenAt < 0.45 &&
      losClear(this.pos.x, this.pos.z, this.target.pos.x, this.target.pos.z);

    // Hurt and outnumbered-feeling: fall back once in a while, not every time.
    if (visible && this.hp <= 30 && this.fallbackCooldown <= 0 && this.state !== 'fallback') {
      this.state = 'fallback';
      this.fallbackTimer = 1.7;
      this.fallbackCooldown = 7;
      const home = this.team === 'ember' ? 3 : 16; // south mid for Ember, site front for Ashen
      this.path = findPath(nearestNode(this.pos.x, this.pos.z), home);
      this.pathIdx = 0;
      if (!this.spokeRetreat) {
        this.spokeRetreat = true;
        ctx.onRetreat(this);
      }
    }

    if (this.state === 'fallback') {
      this.fallbackTimer -= dt;
      if (this.followPath(dt, 5.1) || this.fallbackTimer <= 0) {
        this.state = 'route';
        this.path = [];
      }
      return;
    }

    if (visible) {
      this.engage(dt, ctx, now);
    } else if (this.target && now - this.lastSeenAt < 3.5) {
      // Hunt the last seen position, then give up and resume the route.
      this.moveToward(this.lastSeenPos, dt, 4.7);
      this.faceToward(this.lastSeenPos, dt, 7);
    } else {
      if (this.pathIdx >= this.path.length && this.objectiveNode !== null) this.setObjective(this.objectiveNode);
      this.followPath(dt, 4.6);
    }

    // Separation: never stack two bodies in the same square metre.
    for (const other of ctx.allBots) {
      if (other === this || !other.alive) continue;
      const dx = this.pos.x - other.pos.x;
      const dz = this.pos.z - other.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 0.001 && d2 < 0.81) {
        const d = Math.sqrt(d2);
        this.pos.x += (dx / d) * (0.9 - d) * dt * 3;
        this.pos.z += (dz / d) * (0.9 - d) * dt * 3;
      }
    }
    collide(this.pos, 0.45);
    this.group.rotation.y = this.yaw;
  }

  engage(dt, ctx, now) {
    const t = this.target;
    const dist = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
    this.faceToward(t.pos, dt, 10);

    // Strafe while closing to (or backing out to) the preferred range.
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = randRange(0.5, 1.1);
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    }
    const want = this.preferredRange();
    const f = this.forward();
    let mx = -f.z * this.strafeDir * 0.8;
    let mz = f.x * this.strafeDir * 0.8;
    if (dist > want + 4) { mx += f.x; mz += f.z; }
    else if (dist < want - 4) { mx -= f.x; mz -= f.z; }
    const ml = Math.hypot(mx, mz) || 1;
    this.pos.x += (mx / ml) * 3.1 * dt;
    this.pos.z += (mz / ml) * 3.1 * dt;

    // Fire control: react, burst, breathe, repeat.
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.ammo = this.def.mag;
      return;
    }
    this.fireTimer -= dt;
    if (this.reactionTimer > 0) {
      this.reactionTimer -= dt;
      return;
    }
    if (this.burstWait > 0) {
      this.burstWait -= dt;
      return;
    }
    if (this.fireTimer <= 0) {
      if (this.ammo <= 0) {
        this.reloadTimer = this.def.reload;
        return;
      }
      this.ammo -= 1;
      this.burstLeft -= 1;
      this.fireTimer = this.def.interval * randRange(0.92, 1.12);
      ctx.onBotShoot(this, t);
      if (this.burstLeft <= 0) {
        this.burstLeft = this.def.auto ? 4 + Math.floor(Math.random() * 4) : 1;
        this.burstWait = randRange(0.35, 0.75) * (this.team === 'ashen' ? this.reactionScale : 1);
      }
    }
  }

  followPath(dt, speed) {
    while (this.pathIdx < this.path.length) {
      const node = nodePos(this.path[this.pathIdx]);
      const d = Math.hypot(node.x - this.pos.x, node.z - this.pos.z);
      if (d < 0.7) { this.pathIdx++; continue; }
      this.moveToward(node, dt, speed);
      this.faceToward(node, dt, 6);
      return false;
    }
    return true;
  }

  moveToward(p, dt, speed) {
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return;
    this.pos.x += (dx / d) * speed * dt;
    this.pos.z += (dz / d) * speed * dt;
  }

  faceToward(p, dt, rate) {
    const want = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z));
    let diff = want - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * Math.min(1, dt * rate);
  }
}
