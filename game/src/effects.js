// Pooled effects: tracers, impact sparks, hit bursts, smoke puffs, impact
// flashes, the explosion / detonation pair, and the detonation's ember
// fountain — a short-lived emitter that keeps throwing sparks after the
// fireball dies, so a plant going up has an afterglow, not just a blink.
// Pools are built once; nothing is allocated per frame in the hot loops. A
// tracer is a thin stretched box; a spark is a small tetra with a velocity
// and a life; smoke is a soft sprite that grows and thins as it rises. Sparks
// come in three colours — ember orange for world impacts and Ember hits,
// ashen teal for Ashen hits, pale for the flash charge — so a hit reads as
// what it hit.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { glowTexture } from './textures.js';

const TRACERS = 14;
const SPARKS_PER_POOL = 48;
const TRACER_LIFE = 0.07;
const SPARK_LIFE = 0.5;
const PUFFS = 22;
const FLASHES = 6;

export function createEffects(scene) {
  const glowTex = glowTexture();

  const tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1);
  const tracerMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const mesh = new THREE.Mesh(tracerGeo, tracerMat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerNext = 0;

  // Three spark pools, one per colour, sharing the one tetra geometry.
  const sparkGeo = new THREE.TetrahedronGeometry(0.045);
  function makeSparkPool(colour) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colour) });
    const pool = [];
    for (let i = 0; i < SPARKS_PER_POOL; i += 1) {
      const mesh = new THREE.Mesh(sparkGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      pool.push({ mesh, velocity: new THREE.Vector3(), life: 0 });
    }
    return { pool, next: 0 };
  }
  const sparkPools = {
    ember: makeSparkPool(PALETTE.accent),
    ashen: makeSparkPool(PALETTE.ashen),
    pale: makeSparkPool(PALETTE.ink),
  };

  function burst(poolName, point, normal, count, speed = 1) {
    const entry = sparkPools[poolName];
    for (let i = 0; i < count; i += 1) {
      const s = entry.pool[entry.next];
      entry.next = (entry.next + 1) % SPARKS_PER_POOL;
      s.mesh.position.copy(point);
      s.velocity.set(
        (normal.x + (Math.random() * 2 - 1) * 1.6) * speed,
        (Math.abs(normal.y) + Math.random() * 1.8 + 0.6) * speed,
        (normal.z + (Math.random() * 2 - 1) * 1.6) * speed,
      );
      s.mesh.visible = true;
      s.life = SPARK_LIFE * (0.5 + Math.random() * 0.5);
    }
  }

  // Ember fountains: two emitter slots. While one runs it throws a few
  // sparks every 50 ms, alternating ember and pale, straight up with a
  // wobble — the afterglow of something big going up.
  const fountains = [
    { point: new THREE.Vector3(), left: 0, tick: 0, pale: false },
    { point: new THREE.Vector3(), left: 0, tick: 0, pale: false },
  ];
  let fountainNext = 0;
  function fountain(point, seconds = 0.9) {
    const f = fountains[fountainNext];
    fountainNext = (fountainNext + 1) % fountains.length;
    f.point.copy(point);
    f.left = seconds;
    f.tick = 0;
    f.pale = false;
  }

  // Impact flashes: additive glow sprites that flare and die in a blink.
  const flashes = [];
  for (let i = 0; i < FLASHES; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: new THREE.Color(PALETTE.lamp), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sprite.visible = false;
    scene.add(sprite);
    flashes.push({ sprite, life: 0, max: 0.06, size: 0.4 });
  }
  let flashNext = 0;

  function impactFlash(point, size = 0.4, colour = PALETTE.lamp, life = 0.06) {
    const f = flashes[flashNext];
    flashNext = (flashNext + 1) % FLASHES;
    f.sprite.position.copy(point);
    f.sprite.material.color.set(colour);
    f.size = size;
    f.max = life;
    f.life = life;
    f.sprite.visible = true;
  }

  // Smoke puffs: soft sprites that swell, climb and thin out.
  const puffs = [];
  for (let i = 0; i < PUFFS; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: new THREE.Color('#6e5844'), transparent: true, opacity: 0, depthWrite: false,
    }));
    sprite.visible = false;
    scene.add(sprite);
    puffs.push({ sprite, velocity: new THREE.Vector3(), life: 0, max: 1, grow: 1, strength: 0.3 });
  }
  let puffNext = 0;

  function puff(point, count, opts = {}) {
    const { size = 0.5, life = 0.9, strength = 0.3, rise = 0.9, spread = 0.7 } = opts;
    for (let i = 0; i < count; i += 1) {
      const p = puffs[puffNext];
      puffNext = (puffNext + 1) % PUFFS;
      p.sprite.position.set(
        point.x + (Math.random() * 2 - 1) * 0.12,
        point.y + (Math.random() * 2 - 1) * 0.08,
        point.z + (Math.random() * 2 - 1) * 0.12,
      );
      p.velocity.set((Math.random() * 2 - 1) * spread, rise * (0.7 + Math.random() * 0.6), (Math.random() * 2 - 1) * spread);
      p.max = life * (0.75 + Math.random() * 0.5);
      p.life = p.max;
      p.grow = size;
      p.strength = strength;
      p.sprite.visible = true;
    }
  }

  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 26, 1.4);
  scene.add(boomLight);
  let boomLife = 0;
  let boomSpan = 0.45;
  let boomRadius = 6.5;
  let boomPower = 90;

  // The detonation's ground ring: a flat shockwave that races outward.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.86, 1, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  let ringLife = 0;

  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  function bigBoom(point, radius, power, span) {
    boom.position.copy(point);
    boom.visible = true;
    boomLife = span;
    boomSpan = span;
    boomRadius = radius;
    boomPower = power;
    boomLight.position.copy(point);
    boomLight.position.y += 0.6;
    boomLight.intensity = power;
  }

  return {
    tracer(start, end) {
      const t = tracers[tracerNext];
      tracerNext = (tracerNext + 1) % TRACERS;
      from.copy(start);
      to.copy(end);
      mid.addVectors(from, to).multiplyScalar(0.5);
      t.mesh.position.copy(mid);
      t.mesh.lookAt(to);
      t.mesh.scale.set(1, 1, from.distanceTo(to));
      t.mesh.visible = true;
      t.life = TRACER_LIFE;
    },
    sparksAt(point, normal, count = 8) {
      burst('ember', point, normal, count);
      impactFlash(point, 0.35);
    },
    // A shot that lands on a body: a burst in the victim's team colour.
    hitBurst(point, team) {
      burst(team === 'ashen' ? 'ashen' : 'ember', point, UP, 7);
      impactFlash(point, 0.45, team === 'ashen' ? PALETTE.ashen : PALETTE.accent);
    },
    puff,
    impactFlash,
    explosion(point) {
      bigBoom(point, 6.5, 90, 0.45);
      burst('ember', point, UP, 24);
      puff(point, 6, { size: 1.4, life: 1.4, strength: 0.4, rise: 1.6, spread: 1.2 });
      fountain(point, 0.5);
    },
    // The Spark Charge going up: bigger, brighter, with a ground shockwave,
    // a column of embers and a fountain that keeps the site lit afterwards —
    // the round's exclamation mark.
    detonate(point) {
      bigBoom(point, 11, 170, 0.7);
      burst('ember', point, UP, 30, 1.7);
      burst('pale', point, UP, 12, 1.2);
      puff(point, 8, { size: 2, life: 1.8, strength: 0.45, rise: 2.2, spread: 1.6 });
      ring.position.set(point.x, 0.06, point.z);
      ring.visible = true;
      ringLife = 0.55;
      impactFlash(point, 2.6, PALETTE.lamp, 0.16);
      fountain(point, 1.1);
    },
    // The flash charge: a hard white blink and a spray of pale sparks.
    flashBurst(point) {
      impactFlash(point, 3.4, '#ffffff', 0.15);
      burst('pale', point, UP, 10, 0.8);
    },
    step(dt) {
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        if (t.life <= 0) t.mesh.visible = false;
        else t.mesh.material.opacity = 0.85 * (t.life / TRACER_LIFE);
      }
      for (const f of fountains) {
        if (f.left <= 0) continue;
        f.left -= dt;
        f.tick -= dt;
        if (f.tick <= 0) {
          f.tick = 0.05;
          f.pale = !f.pale;
          burst(f.pale ? 'pale' : 'ember', f.point, UP, 3, 1.35);
        }
      }
      for (const name of Object.keys(sparkPools)) {
        for (const s of sparkPools[name].pool) {
          if (s.life <= 0) continue;
          s.life -= dt;
          if (s.life <= 0) {
            s.mesh.visible = false;
            continue;
          }
          s.velocity.y -= 12 * dt;
          s.mesh.position.addScaledVector(s.velocity, dt);
          if (s.mesh.position.y < 0.03) {
            s.mesh.position.y = 0.03;
            s.velocity.y *= -0.35;
          }
          s.mesh.rotation.x += dt * 9;
          s.mesh.rotation.y += dt * 7;
        }
      }
      for (const f of flashes) {
        if (f.life <= 0) continue;
        f.life -= dt;
        if (f.life <= 0) {
          f.sprite.visible = false;
          f.sprite.material.opacity = 0;
          continue;
        }
        const k = f.life / f.max;
        f.sprite.scale.setScalar(f.size * (1.6 - k * 0.6));
        f.sprite.material.opacity = 0.9 * k;
      }
      for (const p of puffs) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.sprite.visible = false;
          p.sprite.material.opacity = 0;
          continue;
        }
        const k = 1 - p.life / p.max;
        p.sprite.position.addScaledVector(p.velocity, dt);
        p.velocity.multiplyScalar(Math.max(0, 1 - 1.6 * dt));
        const size = p.grow * (0.5 + k * 1.6);
        p.sprite.scale.set(size, size, 1);
        p.sprite.material.opacity = p.strength * Math.sin(Math.PI * Math.min(1, k * 1.12));
      }
      if (boomLife > 0) {
        boomLife -= dt;
        const k = 1 - Math.max(0, boomLife) / boomSpan;
        const radius = 0.6 + k * boomRadius;
        boom.scale.setScalar(radius);
        boom.material.opacity = 0.55 * (1 - k);
        boomLight.intensity = boomPower * (1 - k);
        if (boomLife <= 0) {
          boom.visible = false;
          boomLight.intensity = 0;
        }
      }
      if (ringLife > 0) {
        ringLife -= dt;
        const k = 1 - Math.max(0, ringLife) / 0.55;
        ring.scale.setScalar(0.5 + k * 9);
        ring.material.opacity = 0.6 * (1 - k);
        if (ringLife <= 0) ring.visible = false;
      }
    },
  };
}
