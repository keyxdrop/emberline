// player.js — the one human body in the yard. Pointer-lock aim, WASD feet,
// collision against the world's boxes, and the whole weapon in the hands:
// cadence, magazines, reloads, recoil and the viewmodel that sells them. Hit
// resolution is not decided here; every trigger pull is reported to the game
// through onShoot and the game answers what the bullet found.

import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { collide } from './world.js';

const EYE = 1.62;
const EYE_CROUCH = 1.12;
const RADIUS = 0.45;

export class Player {
  constructor(camera, dom, hooks) {
    this.camera = camera;
    this.dom = dom;
    this.hooks = hooks; // { onShoot(def, origin, dir), onDryFire(), onReload(), onHurt(), onDeath() }
    this.pos = new THREE.Vector3(0, 0, 19);
    this.yaw = Math.PI; // facing north, toward the Forge
    this.pitch = 0;
    this.hp = 100;
    this.alive = true;
    this.armour = false;
    this.weaponId = 'sidekick';
    this.ammo = WEAPONS.sidekick.mag;
    this.reserve = WEAPONS.sidekick.reserve;
    this.grenades = 0;
    this.flashes = 0;
    this.fireTimer = 0;
    this.reloadTimer = 0;
    this.mouseDown = false;
    this.ads = false;
    this.crouch = false;
    this.recoil = 0;
    this.bobPhase = 0;
    this.keys = new Set();
    this.enabled = false; // the game turns input on only while a round is live

    this.buildViewmodel();
    this.bindInput();
  }

  buildViewmodel() {
    const gun = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.5, metalness: 0.6 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xff7a2a, roughness: 0.4, metalness: 0.3, emissive: 0x903c00, emissiveIntensity: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.52), dark);
    body.position.set(0, -0.02, -0.1);
    gun.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 10), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.48);
    gun.add(barrel);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.03, 0.2), accent);
    stripe.position.set(0, 0.05, -0.16);
    gun.add(stripe);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.09), dark);
    grip.position.set(0, -0.13, 0.08);
    grip.rotation.x = 0.35;
    gun.add(grip);
    gun.position.set(0.24, -0.22, -0.45);
    this.gun = gun;
    this.camera.add(gun);
    this.muzzleLocal = new THREE.Vector3(0, 0.02, -0.65);
  }

  bindInput() {
    const el = this.dom;
    el.addEventListener('click', () => {
      if (this.enabled && document.pointerLockElement !== el) el.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      this.yaw -= e.movementX * 0.0021;
      this.pitch -= e.movementY * 0.0021;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.ads = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.ads = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (!this.enabled) return;
      if (e.code === 'KeyR') this.startReload();
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  get def() {
    return WEAPONS[this.weaponId];
  }

  giveWeapon(id) {
    this.weaponId = id;
    this.ammo = this.def.mag;
    this.reserve = this.def.reserve;
    this.reloadTimer = 0;
  }

  startReload() {
    if (this.reloadTimer > 0 || this.ammo >= this.def.mag || this.reserve <= 0 || !this.alive) return;
    this.reloadTimer = this.def.reload;
    this.hooks.onReload();
  }

  // New round, new body: full health, spawn point, kept weapon and gear.
  resetRound(spawn, keep) {
    this.pos.set(spawn.x, 0, spawn.z);
    this.yaw = Math.PI;
    this.pitch = 0;
    this.hp = 100;
    this.alive = true;
    this.mouseDown = false;
    this.fireTimer = 0;
    this.reloadTimer = 0;
    if (!keep.weapon) this.weaponId = 'sidekick';
    this.ammo = this.def.mag;
    this.reserve = this.def.reserve;
    this.armour = keep.armour;
    this.grenades = keep.grenades;
    this.flashes = keep.flashes;
  }

  eyePos() {
    const eye = this.crouch ? EYE_CROUCH : EYE;
    return new THREE.Vector3(this.pos.x, eye, this.pos.z);
  }

  aimDir() {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    return dir;
  }

  muzzlePos() {
    return this.gun.localToWorld(this.muzzleLocal.clone());
  }

  takeDamage(amount, fromPos) {
    if (!this.alive) return 0;
    const dealt = this.armour ? amount * 0.66 : amount;
    this.hp -= dealt;
    this.hooks.onHurt(fromPos);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.mouseDown = false;
      this.hooks.onDeath();
    }
    return dealt;
  }

  update(dt) {
    // Camera follows the body whether or not input is live (shot scenes and
    // death both still need the view placed).
    const eye = this.crouch ? EYE_CROUCH : EYE;
    this.camera.position.set(this.pos.x, eye + Math.sin(this.bobPhase) * 0.03, this.pos.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch + this.recoil * 0.6;
    const targetFov = this.ads ? 75 / this.def.zoom : 75;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 12);
      this.camera.updateProjectionMatrix();
    }
    this.gun.position.y = -0.22 + Math.sin(this.bobPhase * 2) * 0.008 - (this.ads ? -0.06 : 0);
    this.gun.position.x = 0.24 - (this.ads ? 0.24 : 0);
    this.recoil = Math.max(0, this.recoil - dt * 6);

    if (!this.enabled || !this.alive) return;

    // Feet.
    this.crouch = this.keys.has('ControlLeft') || this.keys.has('KeyC');
    const slow = this.keys.has('ShiftLeft') || this.crouch;
    const speed = this.crouch ? 2.3 : slow ? 2.7 : 5.4;
    const fwd = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const side = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    if (fwd !== 0 || side !== 0) {
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      const mx = (-sin * fwd + cos * side);
      const mz = (-cos * fwd - sin * side);
      const len = Math.hypot(mx, mz) || 1;
      this.pos.x += (mx / len) * speed * dt;
      this.pos.z += (mz / len) * speed * dt;
      collide(this.pos, RADIUS);
      this.bobPhase += dt * (slow ? 5 : 9);
    }

    // Trigger.
    this.fireTimer -= dt;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const need = this.def.mag - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take;
        this.reserve -= take;
      }
    } else if (this.mouseDown && this.fireTimer <= 0) {
      if (this.ammo <= 0) {
        this.hooks.onDryFire();
        this.fireTimer = 0.25;
        this.startReload();
      } else if (this.def.auto || !this.wasDown) {
        // Automatics fire while held; semi-automatics fire once per fresh press.
        this.shootOnce();
      }
    }
    this.wasDown = this.mouseDown;
  }

  shootOnce() {
    this.ammo -= 1;
    this.fireTimer = this.def.interval;
    this.recoil = Math.min(0.05, this.recoil + 0.016);
    const origin = this.muzzlePos();
    const dir = this.aimDir();
    this.hooks.onShoot(this.def, origin, dir);
    if (this.ammo === 0) this.startReload();
  }
}
