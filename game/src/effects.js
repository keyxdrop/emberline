// effects.js — everything that flashes, flies or fountains. Tracers, impact
// sparks, muzzle light and the detonation's ember fountain live here as pooled
// objects: a firefight spawns hundreds of them, so none of them allocate.

import * as THREE from 'three';
import { glowTexture } from './world.js';

const MAX_PARTICLES = 1400;
const MAX_TRACERS = 72;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const glow = glowTexture();

    // Particle pool: one Points cloud, per-particle velocity and life in JS.
    this.pGeo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    this.pVel = new Float32Array(MAX_PARTICLES * 3);
    this.pLife = new Float32Array(MAX_PARTICLES); // seconds left
    this.pSpan = new Float32Array(MAX_PARTICLES); // seconds total
    this.pGrav = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) this.pPos[i * 3 + 1] = -999;
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    const pMat = new THREE.PointsMaterial({
      size: 0.16, map: glow, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.pGeo, pMat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.pCursor = 0;

    // Tracer pool: thin additive boxes stretched between muzzle and impact.
    this.tracers = [];
    const tGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
    for (let i = 0; i < MAX_TRACERS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffc37a, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(tGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.tracers.push({ mesh, life: 0 });
    }
    this.tCursor = 0;

    // One shared flash light and sprite, reused by every muzzle and blast.
    this.flashLight = new THREE.PointLight(0xffa050, 0, 16, 1.8);
    scene.add(this.flashLight);
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: 0xffcf9a, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(this.flashSprite);
    this.flashLife = 0;

    // Shockwave rings for the detonation.
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff8a3c, transparent: true, opacity: 0, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push({ mesh, life: 0 });
    }
  }

  spawnParticle(x, y, z, vx, vy, vz, life, r, g, b, grav) {
    const i = this.pCursor;
    this.pCursor = (this.pCursor + 1) % MAX_PARTICLES;
    this.pPos.set([x, y, z], i * 3);
    this.pVel.set([vx, vy, vz], i * 3);
    this.pCol.set([r, g, b], i * 3);
    this.pLife[i] = life;
    this.pSpan[i] = life;
    this.pGrav[i] = grav;
  }

  sparks(pos, count, color = 0xffa050, speed = 3.4, up = 1.6) {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.spawnParticle(
        pos.x, pos.y, pos.z,
        Math.cos(a) * s, Math.random() * up, Math.sin(a) * s,
        0.25 + Math.random() * 0.3,
        c.r * (0.7 + Math.random() * 0.5), c.g * (0.7 + Math.random() * 0.4), c.b,
        5.5,
      );
    }
  }

  // The detonation's signature: a fountain of embers that keeps breathing for
  // seconds after the charge goes off, lit by a shockwave and a hard flash.
  emberFountain(pos) {
    for (let n = 0; n < 300; n++) {
      const a = Math.random() * Math.PI * 2;
      const rad = Math.random() * 1.6;
      const heat = 0.65 + Math.random() * 0.35;
      this.spawnParticle(
        pos.x + Math.cos(a) * rad, 0.4, pos.z + Math.sin(a) * rad,
        Math.cos(a) * (0.6 + Math.random() * 1.8), 5.5 + Math.random() * 6.5, Math.sin(a) * (0.6 + Math.random() * 1.8),
        2.2 + Math.random() * 2.4,
        1.0 * heat, 0.42 * heat, 0.08,
        2.6,
      );
    }
    this.ringAt(pos, 0xff8a3c);
    this.flash(pos, 3.2, 60);
  }

  ringAt(pos, color) {
    const ring = this.rings.find((r) => r.life <= 0) ?? this.rings[0];
    ring.mesh.material.color.setHex(color);
    ring.mesh.position.set(pos.x, 0.25, pos.z);
    ring.life = 1;
    ring.mesh.visible = true;
  }

  tracer(from, to, color = 0xffc37a) {
    const t = this.tracers[this.tCursor];
    this.tCursor = (this.tCursor + 1) % MAX_TRACERS;
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    t.mesh.position.copy(from).add(to).multiplyScalar(0.5);
    t.mesh.scale.set(1, 1, len);
    t.mesh.lookAt(to);
    t.mesh.material.color.setHex(color);
    t.mesh.material.opacity = 0.85;
    t.mesh.visible = true;
    t.life = 0.075;
  }

  flash(pos, scale = 1.1, intensity = 26) {
    this.flashSprite.position.copy(pos);
    this.flashSprite.scale.set(scale, scale, 1);
    this.flashSprite.material.opacity = 0.95;
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = intensity;
    this.flashLife = 0.06;
  }

  update(dt) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      const j = i * 3;
      if (this.pLife[i] <= 0) { this.pPos[j + 1] = -999; continue; }
      this.pVel[j + 1] -= this.pGrav[i] * dt;
      this.pPos[j] += this.pVel[j] * dt;
      this.pPos[j + 1] += this.pVel[j + 1] * dt;
      this.pPos[j + 2] += this.pVel[j + 2] * dt;
      if (this.pPos[j + 1] < 0.05) { this.pPos[j + 1] = 0.05; this.pVel[j + 1] *= -0.35; }
      const fade = Math.min(1, this.pLife[i] / (this.pSpan[i] * 0.4));
      this.pGeo.attributes.color.setXYZ(i,
        this.pCol[j] * fade, this.pCol[j + 1] * fade, this.pCol[j + 2] * fade);
    }
    this.pGeo.attributes.position.needsUpdate = true;
    this.pGeo.attributes.color.needsUpdate = true;

    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; continue; }
      t.mesh.material.opacity = (t.life / 0.075) * 0.85;
    }

    if (this.flashLife > 0) {
      this.flashLife -= dt;
      const k = Math.max(0, this.flashLife / 0.06);
      this.flashSprite.material.opacity = 0.95 * k;
      this.flashLight.intensity *= k;
      if (this.flashLife <= 0) { this.flashSprite.material.opacity = 0; this.flashLight.intensity = 0; }
    }

    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt * 0.55;
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      const s = 1 + (1 - r.life) * 15;
      r.mesh.scale.set(s, s, 1);
      r.mesh.material.opacity = r.life * 0.7;
    }
  }
}
