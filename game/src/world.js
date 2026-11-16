// world.js — the Foundry Yard at dusk. Builds every mesh a player can see,
// every collider a body can touch, and the waypoint graph the bots walk. One
// coordinate story for the whole game: north is -z (the Forge and the Ashen),
// south is +z (Ember spawn), the yard runs x -26..26 and z -22..22.

import * as THREE from 'three';

export const YARD = { minX: -26, maxX: 26, minZ: -22, maxZ: 22 };
export const SITE = { x: 0, z: -16, r: 4.5 };

export const EMBER_SPAWNS = [
  { x: 0, z: 19 }, { x: -4.5, z: 18 }, { x: 4.5, z: 18 }, { x: -8.5, z: 16.5 }, { x: 8.5, z: 16.5 },
];
export const ASHEN_SPAWNS = [
  { x: 0, z: -11.5 }, { x: -7, z: -13 }, { x: 7, z: -13 }, { x: -13, z: -9 }, { x: 13, z: -9 },
];

// Waypoint graph. Bots path through these nodes; links are walkable both ways.
const NODES = [
  { x: 0, z: 18, links: [1, 2, 3] }, // 0 ember heart
  { x: -8, z: 16, links: [0, 4] }, // 1 ember west
  { x: 8, z: 16, links: [0, 7] }, // 2 ember east
  { x: 0, z: 11, links: [0, 10] }, // 3 south mid
  { x: -16, z: 12, links: [1, 5] }, // 4 alley mouth
  { x: -16, z: 4, links: [4, 6, 10] }, // 5 alley mid
  { x: -16, z: -5, links: [5, 13, 11] }, // 6 alley north
  { x: 16, z: 12, links: [2, 8] }, // 7 kiln mouth
  { x: 16, z: 4, links: [7, 9, 10] }, // 8 kiln mid
  { x: 16, z: -5, links: [8, 15, 12] }, // 9 kiln north
  { x: 0, z: 5, links: [3, 5, 8, 11] }, // 10 furnace row
  { x: -3, z: -3, links: [10, 6, 12, 16] }, // 11 mid west
  { x: 3, z: -8, links: [11, 9, 17, 18] }, // 12 mid east
  { x: -13, z: -11, links: [6, 14] }, // 13 west apron
  { x: -6, z: -14, links: [13, 16] }, // 14 site west
  { x: 13, z: -11, links: [9, 17] }, // 15 east apron
  { x: 0, z: -13.5, links: [11, 14, 17, 18] }, // 16 site front
  { x: 6, z: -14, links: [15, 16, 18] }, // 17 site east
  { x: 0, z: -16, links: [16, 17] }, // 18 the Forge (site centre)
];

export function nearestNode(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    const d = (NODES[i].x - x) ** 2 + (NODES[i].z - z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Breadth-first path over the waypoint graph, as a list of node indices.
export function findPath(from, to) {
  if (from === to) return [from];
  const prev = new Map([[from, -1]]);
  const queue = [from];
  while (queue.length > 0) {
    const at = queue.shift();
    for (const next of NODES[at].links) {
      if (prev.has(next)) continue;
      prev.set(next, at);
      if (next === to) {
        const path = [to];
        let step = at;
        while (step !== -1) { path.unshift(step); step = prev.get(step); }
        return path;
      }
      queue.push(next);
    }
  }
  return [from];
}

export function nodePos(i) {
  return NODES[i];
}

// ---- canvas textures: all art is made in code, nothing is fetched ----

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function groundTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#2e2622'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = 34 + Math.random() * 30;
      g.fillStyle = `rgb(${v + 12},${v},${v - 8})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo((w / 4) * i, 0); g.lineTo((w / 4) * i, h); g.stroke();
      g.beginPath(); g.moveTo(0, (h / 4) * i); g.lineTo(w, (h / 4) * i); g.stroke();
    }
    g.fillStyle = 'rgba(255,122,42,0.10)';
    g.fillRect(0, h * 0.46, w, h * 0.08);
  });
}

function crateTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#6d4c2f'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) {
      g.fillStyle = y % 2 ? '#755434' : '#654628';
      g.fillRect(0, (h / 4) * y, w, h / 4 - 3);
    }
    g.strokeStyle = '#3d2812'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h);
    g.lineWidth = 9; g.stroke();
  });
}

function metalTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#3c4148'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = 52 + Math.random() * 26;
      g.fillStyle = `rgb(${v},${v + 4},${v + 10})`;
      g.fillRect(Math.random() * w, Math.random() * h, 3, 2);
    }
    g.strokeStyle = 'rgba(12,14,18,0.8)'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = '#22262c';
    for (const [x, y] of [[18, 18], [w - 18, 18], [18, h - 18], [w - 18, h - 18]]) {
      g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
    }
  });
}

function hazardTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#241d18'; g.fillRect(0, 0, w, h);
    g.save();
    g.translate(w / 2, h / 2); g.rotate(Math.PI / 4);
    g.fillStyle = 'rgba(255,150,50,0.55)';
    for (let x = -w; x < w; x += 44) g.fillRect(x, -h, 20, h * 2);
    g.restore();
    g.strokeStyle = 'rgba(255,170,70,0.9)'; g.lineWidth = 10;
    g.beginPath(); g.arc(w / 2, h / 2, w * 0.36, 0, Math.PI * 2); g.stroke();
  });
}

export function glowTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  });
}

// A floating name plate for a bot: drawn once, carried over its head.
export function makeNameSprite(name, colorCss) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 56;
  const g = c.getContext('2d');
  g.font = 'bold 30px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 6;
  g.fillStyle = colorCss;
  g.fillText(name, 128, 28);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.3, 0.5, 1);
  return sprite;
}

// ---- collision & sight ----

const colliders = []; // {minX,maxX,minZ,maxZ,h}
const losBlockers = []; // colliders tall enough to hide a standing fighter

function addCollider(x, z, w, d, h) {
  const box = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h };
  colliders.push(box);
  if (h >= 1.5) losBlockers.push(box);
  return box;
}

// Push a circle (a body) out of every box and keep it inside the yard.
export function collide(pos, radius) {
  pos.x = Math.max(YARD.minX + radius, Math.min(YARD.maxX - radius, pos.x));
  pos.z = Math.max(YARD.minZ + radius, Math.min(YARD.maxZ - radius, pos.z));
  for (const b of colliders) {
    const nx = Math.max(b.minX, Math.min(b.maxX, pos.x));
    const nz = Math.max(b.minZ, Math.min(b.maxZ, pos.z));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * radius;
      pos.z = nz + (dz / d) * radius;
    } else {
      // Centre inside the box: leave by the shallowest face.
      const left = pos.x - b.minX, right = b.maxX - pos.x;
      const near = pos.z - b.minZ, far = b.maxZ - pos.z;
      const m = Math.min(left, right, near, far);
      if (m === left) pos.x = b.minX - radius;
      else if (m === right) pos.x = b.maxX + radius;
      else if (m === near) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    }
  }
}

// True when the straight line between two eye points crosses no tall cover.
export function losClear(ax, az, bx, bz) {
  for (const b of losBlockers) {
    if (segmentHitsBox(ax, az, bx, bz, b)) return false;
  }
  return true;
}

function segmentHitsBox(ax, az, bx, bz, b) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < b.minX || ax > b.maxX) return false;
  } else {
    let ta = (b.minX - ax) / dx, tb = (b.maxX - ax) / dx;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < b.minZ || az > b.maxZ) return false;
  } else {
    let ta = (b.minZ - az) / dz, tb = (b.maxZ - az) / dz;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

// Distance from a point to the nearest tall cover edge (for bot spacing).
export function coverDistance(x, z) {
  let best = Infinity;
  for (const b of losBlockers) {
    const nx = Math.max(b.minX, Math.min(b.maxX, x));
    const nz = Math.max(b.minZ, Math.min(b.maxZ, z));
    best = Math.min(best, Math.hypot(x - nx, z - nz));
  }
  return best;
}

// ---- the build ----

export function buildWorld(scene) {
  scene.background = new THREE.Color(0x191021);
  scene.fog = new THREE.Fog(0x2a1822, 34, 115);

  // Sky dome: a dusk gradient, drawn on the inside of a far sphere.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, fog: false, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0x241a38) }, mid: { value: new THREE.Color(0x59302a) }, low: { value: new THREE.Color(0x8a4526) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low; void main(){ float h = normalize(vP).y; vec3 c = h > 0.18 ? mix(mid, top, smoothstep(0.18, 0.65, h)) : mix(low, mid, smoothstep(-0.06, 0.18, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(240, 24, 16), skyMat));

  const hemi = new THREE.HemisphereLight(0x8a76b8, 0x33200f, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff9550, 1.6);
  sun.position.set(-38, 30, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -36; sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 36; sun.shadow.camera.bottom = -36;
  sun.shadow.camera.far = 130;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x40304a, 0.5));

  const groundTex = groundTexture();
  groundTex.repeat.set(6, 5);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(YARD.maxX - YARD.minX + 30, YARD.maxZ - YARD.minZ + 30),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0.05 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85 });
  const metalMat = new THREE.MeshStandardMaterial({ map: metalTexture(), roughness: 0.6, metalness: 0.55 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c2622, roughness: 0.9 });
  const lavaMat = new THREE.MeshBasicMaterial({ color: 0xffa03c });

  const solids = new THREE.Group();
  scene.add(solids);
  const box = (x, z, w, d, h, mat, lavaSlits = false) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    solids.add(m);
    addCollider(x, z, w, d, h);
    if (lavaSlits) {
      for (const side of [-1, 1]) {
        const slit = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.16, 0.06), lavaMat);
        slit.position.set(x, h * 0.62, z + side * (d / 2 + 0.03));
        solids.add(slit);
        const slit2 = slit.clone();
        slit2.position.y = h * 0.4;
        solids.add(slit2);
      }
    }
    return m;
  };

  // Perimeter walls.
  box(0, YARD.minZ - 1, 56, 2, 4.5, metalMat);
  box(0, YARD.maxZ + 1, 56, 2, 4.5, metalMat);
  box(YARD.minX - 1, 0, 2, 48, 4.5, metalMat);
  box(YARD.maxX + 1, 0, 2, 48, 4.5, metalMat);

  // The Forge itself: the furnace the site wraps around.
  box(0, -20.6, 15, 2.6, 6.5, metalMat, true);
  box(-8.6, -19.6, 2.4, 4.4, 3.2, metalMat);
  box(8.6, -19.6, 2.4, 4.4, 3.2, metalMat);

  // Furnace towers on Furnace Row.
  box(-5, -1, 3.4, 3.4, 5, metalMat, true);
  box(5.5, 3, 3.4, 3.4, 5, metalMat, true);
  box(0, 1, 6.4, 0.8, 1.05, darkMat); // low mid barrier

  // Crate cover, lane by lane.
  box(-11, 7, 2.2, 2.2, 1.1, crateMat); box(-11, 7, 1.6, 1.6, 2.2, crateMat);
  box(11, 8, 2.2, 2.2, 1.1, crateMat); box(12.2, 8, 1.4, 1.4, 2.2, crateMat);
  box(-15, -2, 4.2, 1.6, 1.1, crateMat);
  box(15, -2, 4.2, 1.6, 1.1, crateMat);
  box(-3, 12, 2, 2, 1.1, crateMat);
  box(3.4, 12.6, 1.6, 1.6, 1.1, crateMat);
  box(3, -11, 2.4, 2.4, 1.1, crateMat);
  box(-8, -14.5, 2, 2, 1.1, crateMat);
  box(8, -14.5, 2, 2, 1.1, crateMat);
  box(-19, 8, 2.6, 2.6, 2.3, metalMat);
  box(19, 8, 2.6, 2.6, 2.3, metalMat);
  box(-16, -9.5, 1.3, 1.3, 2.4, metalMat);
  box(16, -9.5, 1.3, 1.3, 2.4, metalMat);
  box(-21, -14, 3, 2, 1.1, crateMat);
  box(21, -14, 3, 2, 1.1, crateMat);

  // Distant foundry silhouettes beyond the walls.
  const silMat = new THREE.MeshBasicMaterial({ color: 0x140d18 });
  for (const [x, z, w, h] of [[-40, -34, 10, 26], [-18, -40, 7, 34], [22, -38, 8, 30], [44, -20, 9, 22], [-46, 6, 8, 18], [40, 22, 10, 15]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), silMat);
    m.position.set(x, h / 2, z);
    scene.add(m);
  }

  // The site: a hazard disc and the ring that reports the charge's state.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(SITE.r, 40),
    new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.9 }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(SITE.x, 0.02, SITE.z);
  disc.receiveShadow = true;
  scene.add(disc);

  const ringMat = new THREE.MeshBasicMaterial({ color: 0x2affd8, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(SITE.r - 0.55, SITE.r, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(SITE.x, 0.06, SITE.z);
  scene.add(ring);

  const siteLight = new THREE.PointLight(0x2affd8, 26, 20, 1.8);
  siteLight.position.set(SITE.x, 3.2, SITE.z);
  scene.add(siteLight);

  const furnaceLights = [];
  for (const [x, z] of [[-5, -1], [5.5, 3], [0, -19]]) {
    const l = new THREE.PointLight(0xff6a22, 20, 17, 1.9);
    l.position.set(x, 2.6, z);
    scene.add(l);
    furnaceLights.push(l);
  }

  let ringMode = 'idle';
  let elapsed = 0;
  const RING_COLORS = { idle: 0x2affd8, planting: 0xffb02e, planted: 0xff2e2e, defusing: 0xff2e2e };

  return {
    solids,
    site: SITE,
    ring,
    siteLight,
    setRingMode(mode) { ringMode = mode; },
    update(dt) {
      elapsed += dt;
      for (let i = 0; i < furnaceLights.length; i++) {
        furnaceLights[i].intensity = 18 + Math.sin(elapsed * 9 + i * 2.4) * 3.5 + Math.sin(elapsed * 23 + i) * 1.6;
      }
      const color = RING_COLORS[ringMode] ?? RING_COLORS.idle;
      ringMat.color.setHex(color);
      siteLight.color.setHex(color);
      if (ringMode === 'planted' || ringMode === 'defusing') {
        const pulse = 0.55 + 0.45 * Math.sin(elapsed * 11);
        ringMat.opacity = 0.45 + 0.55 * pulse;
        siteLight.intensity = 14 + 26 * pulse;
        const s = 1 + 0.03 * Math.sin(elapsed * 11);
        ring.scale.set(s, s, 1);
      } else if (ringMode === 'planting') {
        ringMat.opacity = 0.65 + 0.35 * Math.sin(elapsed * 5);
        siteLight.intensity = 22;
        ring.scale.set(1, 1, 1);
      } else {
        ringMat.opacity = 0.75 + 0.2 * Math.sin(elapsed * 1.8);
        siteLight.intensity = 24;
        ring.scale.set(1, 1, 1);
      }
    },
  };
}
