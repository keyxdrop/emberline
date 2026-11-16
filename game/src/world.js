// The map: Foundry Yard, a 44 x 36 m dusk industrial yard. Ember spawns south,
// Ashen spawns north; Relay A (Crane Yard, west) and Relay B (Furnace Hall, east)
// are the plant sites. Three lanes — Pipe Alley west, Foundry Floor mid, Container
// Row east — join them. Every box is a collider for bodies and a surface a bullet
// stops on. The dressing is procedural: canvas-painted concrete, corrugated
// walls and plate metal, a gradient dusk sky with a skyline beyond the walls,
// barrels, pipework, a working crane, hanging lamps, drifting embers and the
// furnace's smoke. Props hug the walls and corners so the lanes, routes and
// holds the bots play on stay exactly as they were. The site rings breathe
// slowly while a round is live; the moment a Spark is planted, its ring
// switches to a fast, bright pulse (setPlanted, called from main.js), so the
// round's state reads from anywhere in the yard.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import {
  concreteTexture, corrugatedTexture, plateMetalTexture, crateTexture,
  containerTexture, barrelTexture, signTexture, glowTexture, skyTexture,
} from './textures.js';

export const SITES = {
  A: { name: 'Relay A · Crane Yard', center: new THREE.Vector3(-16, 0, -11), radius: 3.4 },
  B: { name: 'Relay B · Furnace Hall', center: new THREE.Vector3(16, 0, -11), radius: 3.4 },
};

export const SPAWNS = {
  ember: [[-4, 14], [-2, 15.5], [0, 15.5], [2, 15.5], [4, 14]],
  ashen: [[-4, -14], [-2, -15.5], [0, -15.5], [2, -15.5], [4, -14]],
};

// Waypoint routes, [x, z] lists. Attackers pick one per round; defenders hold.
export const ROUTES = {
  emberAWest: [[0, 14], [-6, 12], [-14, 10], [-17, 4], [-17, -4], [-16, -9]],
  emberAMid: [[0, 14], [0, 8], [-2, 2], [-6, -3], [-11, -7], [-16, -10]],
  emberBEast: [[0, 14], [6, 12], [14, 10], [17, 4], [17, -4], [16, -9]],
  emberBMid: [[0, 14], [0, 8], [2, 2], [6, -3], [11, -7], [16, -10]],
  ashenA: [[0, -14], [-8, -13], [-13.5, -11.5]],
  ashenB: [[0, -14], [8, -13], [13.5, -11.5]],
  ashenMid: [[0, -14], [0, -8]],
  retakeA: [[13.5, -11.5], [6, -13], [0, -13], [-8, -13], [-14, -11]],
  retakeB: [[-13.5, -11.5], [-6, -13], [0, -13], [8, -13], [14, -11]],
  retakeAMid: [[0, -8], [-6, -9], [-12, -10], [-15, -11]],
  retakeBMid: [[0, -8], [6, -9], [12, -10], [15, -11]],
};

export const HOLDS = {
  A1: { at: [-13.2, -8.6], face: [-13, -2] },
  A2: { at: [-18.6, -13.6], face: [-12, -8] },
  B1: { at: [13.2, -8.6], face: [13, -2] },
  B2: { at: [18.6, -13.6], face: [12, -8] },
  Mid: { at: [0, -7], face: [0, 2] },
};

export function areaName(x, z) {
  if (z <= -6) {
    if (x < -8) return 'Relay A · Crane Yard';
    if (x > 8) return 'Relay B · Furnace Hall';
    return 'Ashen Gate';
  }
  if (z >= 8) return 'Ember Yard';
  if (x < -11) return 'Pipe Alley';
  if (x > 11) return 'Container Row';
  return 'Foundry Floor';
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  // Painted surfaces replace the flat colours on the big pieces.
  materials.canvas = new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.96, metalness: 0.02 });
  materials.wall = new THREE.MeshStandardMaterial({ map: corrugatedTexture(), roughness: 0.82, metalness: 0.18 });
  materials.hairline = new THREE.MeshStandardMaterial({ map: plateMetalTexture(), roughness: 0.78, metalness: 0.28 });
  materials.surface = materials.hairline;
  materials.crate = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.9, metalness: 0.02 });
  materials.containerRust = new THREE.MeshStandardMaterial({ map: containerTexture('rust'), roughness: 0.8, metalness: 0.2 });
  materials.containerTeal = new THREE.MeshStandardMaterial({ map: containerTexture('teal'), roughness: 0.8, metalness: 0.2 });
  materials.barrel = new THREE.MeshStandardMaterial({ map: barrelTexture(), roughness: 0.72, metalness: 0.35 });
  materials.steel = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.42, metalness: 0.65 });
  const emberGlow = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent),
    emissiveIntensity: 1.4, roughness: 0.5,
  });
  const ashenGlow = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.ashen), emissive: new THREE.Color(PALETTE.ashen),
    emissiveIntensity: 1.1, roughness: 0.5,
  });
  const lampGlow = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.lamp), emissive: new THREE.Color(PALETTE.lamp),
    emissiveIntensity: 2.2, roughness: 0.4,
  });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // A dressed prop: any mesh, optionally a body collider and a bullet surface.
  function prop(mesh, collide = true, shootable = true) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    if (shootable) shootables.push(mesh);
    return mesh;
  }

  function barrel(x, z, scaleY = 1) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.95 * scaleY, 14), materials.barrel);
    mesh.position.set(x, 0.475 * scaleY, z);
    return prop(mesh);
  }

  function sign(title, sub, tone, width, x, y, z, rotY) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width / 2),
      new THREE.MeshBasicMaterial({ map: signTexture(title, sub, tone) }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    group.add(mesh);
    return mesh;
  }

  // --- Sky: a gradient dome, a low sun, and the skyline beyond the walls. ---
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(95, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  scene.add(skyDome);
  const glowTex = glowTexture();
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: new THREE.Color('#ff9440'), transparent: true, opacity: 0.95, fog: false, depthWrite: false,
  }));
  sun.position.set(-58, 10, -34);
  sun.scale.setScalar(34);
  scene.add(sun);
  const skylineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.soot) });
  const skylineHeights = [9, 13, 7, 15, 10, 12, 8, 14, 9, 11];
  for (let i = 0; i < 10; i += 1) {
    const h = skylineHeights[i];
    const north = new THREE.Mesh(new THREE.BoxGeometry(7, h, 6), skylineMat);
    north.position.set(-40 + i * 9, h / 2 - 0.5, -31);
    scene.add(north);
    const south = new THREE.Mesh(new THREE.BoxGeometry(7, skylineHeights[9 - i] * 0.8, 6), skylineMat);
    south.position.set(-38 + i * 9, skylineHeights[9 - i] * 0.4 - 0.5, 31);
    scene.add(south);
    const west = new THREE.Mesh(new THREE.BoxGeometry(6, skylineHeights[(i + 3) % 10], 7), skylineMat);
    west.position.set(-33, skylineHeights[(i + 3) % 10] / 2 - 0.5, -27 + i * 6);
    scene.add(west);
    const east = new THREE.Mesh(new THREE.BoxGeometry(6, skylineHeights[(i + 6) % 10] * 0.9, 7), skylineMat);
    east.position.set(33, skylineHeights[(i + 6) % 10] * 0.45 - 0.5, -27 + i * 6);
    scene.add(east);
  }

  // Floor and walls: 44 x 36 m, 5 m walls, open to the dusk sky.
  box(44.4, 0.4, 36.4, 0, -0.2, 0, 'canvas');
  box(0.4, 5, 36.4, -22.2, 2.5, 0, 'wall');
  box(0.4, 5, 36.4, 22.2, 2.5, 0, 'wall');
  box(44.4, 5, 0.4, 0, 2.5, -18.2, 'wall');
  box(44.4, 5, 0.4, 0, 2.5, 18.2, 'wall');

  // Painted floor markings: a ring around the furnace and the lane dashes
  // the yard crew walk by. Flat decals — no colliders, no bullet stops.
  const paintMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.32 });
  const furnaceRing = new THREE.Mesh(new THREE.RingGeometry(4.7, 4.95, 48), paintMat);
  furnaceRing.rotation.x = -Math.PI / 2;
  furnaceRing.position.set(0, 0.02, -2);
  group.add(furnaceRing);
  const dashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.muted), transparent: true, opacity: 0.4 });
  for (const z of [3.5, 6.5, 9.5, 12.5]) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 1.7), dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.02, z);
    group.add(dash);
  }

  // Wall signage: the yard labels itself.
  sign('FOUNDRY YARD', 'SECTOR 7 — EMBERLINE', 'accent', 9, 0, 3.2, -17.96, 0);
  sign('RELAY A', 'CRANE YARD', 'accent', 5.4, -21.96, 3, -11, Math.PI / 2);
  sign('RELAY B', 'FURNACE HALL', 'ashen', 5.4, 21.96, 3, -11, -Math.PI / 2);
  sign('EMBER YARD', 'EMBERLINE CREW', 'accent', 6.4, 0, 3.1, 17.96, Math.PI);

  // The furnace, mid: the map's heart and its biggest block of cover.
  box(7, 3.2, 4.5, 0, 1.6, -2, 'hairline');
  box(1.4, 6.5, 1.4, 3.2, 3.25, -3.2, 'surface');
  box(5.4, 0.5, 3.2, 0, 3.45, -2, 'surface');
  // Furnace mouth: a glowing slit on its south face, and its warning plate.
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.12), emberGlow);
  mouth.position.set(0, 0.9, 0.28);
  group.add(mouth);
  sign('DANGER', 'MOLTEN CORE', 'danger', 2.4, -2.2, 2.3, 0.27, 0);

  // The crane over Relay A: two legs, a beam, and a load that sways — a
  // container on cables, hung from a trolley on the beam.
  box(0.8, 5.5, 0.8, -18.4, 2.75, -13.4, 'surface');
  box(0.8, 5.5, 0.8, -13.6, 2.75, -13.4, 'surface');
  box(5.6, 0.7, 0.9, -16, 5.4, -13.4, 'surface');
  box(0.5, 0.5, 0.5, -16, 4.6, -13.4, 'accent');
  box(0.08, 1.1, 0.08, -16, 5.0, -13.4, 'hairline');
  const craneSwing = new THREE.Group();
  craneSwing.position.set(-16, 5.05, -13.4);
  group.add(craneSwing);
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.9), materials.steel);
  trolley.position.y = 0.1;
  craneSwing.add(trolley);
  for (const dx of [-1.2, 1.2]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6), materials.soot);
    cable.position.set(dx, -0.75, 0);
    craneSwing.add(cable);
  }
  const spreader = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.18, 0.5), materials.steel);
  spreader.position.y = -1.45;
  craneSwing.add(spreader);
  const hungLoad = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.5, 1.5), materials.containerTeal);
  hungLoad.position.y = -2.3;
  hungLoad.castShadow = true;
  craneSwing.add(hungLoad);
  shootables.push(hungLoad);

  // Containers and crates: crouch cover and lane blocks.
  box(4.2, 2.6, 2.4, 14, 1.3, -14.6, 'containerTeal');
  box(4.2, 2.6, 2.4, -6, 1.3, 9, 'containerRust');
  box(2.4, 2.6, 4.2, -14, 1.3, -16.6, 'containerRust');
  box(2.4, 2.4, 2.4, 18.5, 1.2, 2, 'surface');
  box(2.4, 2.4, 2.4, -18.5, 1.2, 2, 'surface');
  box(1.1, 1.1, 1.1, -10, 0.55, 6, 'crate');
  box(1.1, 1.1, 1.1, -11.2, 0.55, 6, 'crate');
  box(1.1, 1.1, 1.1, -10.6, 1.65, 6, 'crate');
  box(1.1, 1.1, 1.1, 10, 0.55, 6, 'crate');
  box(1.1, 1.1, 1.1, 11.2, 0.55, 6, 'crate');
  box(0.7, 0.7, 0.7, -15, 0.35, -5, 'crate');
  box(0.7, 0.7, 0.7, 15, 0.35, -5, 'crate');
  box(1.1, 1.1, 1.1, -2, 0.55, -9, 'crate');
  box(1.1, 1.1, 1.1, 2, 0.55, -9, 'crate');

  // Crate stacks and pallets in the dead corners, clear of every route.
  box(1.5, 0.12, 1.5, -20.8, 0.06, 15.9, 'hairline');
  box(1.4, 1.4, 1.4, -20.8, 0.82, 15.9, 'crate');
  box(1.0, 1.0, 1.0, -20.7, 2.02, 15.8, 'crate');
  box(1.5, 0.12, 1.5, 20.8, 0.06, -16.2, 'hairline');
  box(1.4, 1.4, 1.4, 20.8, 0.82, -16.2, 'crate');
  box(1.1, 1.1, 1.1, 20.9, 2.07, -16.1, 'crate');

  // Barrels: fuel and slag, clustered where nobody routes.
  barrel(-20.6, -16.2); barrel(-19.8, -16.6); barrel(-20.2, -15.3, 0.92);
  barrel(20.7, 16.3); barrel(19.9, 16.7);
  barrel(20.8, -5.5); barrel(20.7, -4.6, 0.9);
  barrel(-20.8, 6.5); barrel(-20.7, 7.4);
  barrel(4.7, -4.5); barrel(5.5, -4.1, 0.9);
  // One live fuel barrel by the furnace wears an ember band.
  const fuelBand = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.335, 0.16, 14), emberGlow);
  fuelBand.position.set(4.7, 0.62, -4.5);
  group.add(fuelBand);

  // Pillars and concrete barriers.
  box(1.2, 3.2, 1.2, -8, 1.6, 2, 'surface');
  box(1.2, 3.2, 1.2, 8, 1.6, 2, 'surface');
  box(1.2, 3.2, 1.2, -8, 1.6, -8, 'surface');
  box(1.2, 3.2, 1.2, 8, 1.6, -8, 'surface');
  box(2.6, 1.0, 0.9, -4, 0.5, 6, 'surface');
  box(2.6, 1.0, 0.9, 4, 0.5, 6, 'surface');
  box(2.6, 1.0, 0.9, -12, 0.5, -4, 'surface');
  box(2.6, 1.0, 0.9, 12, 0.5, -4, 'surface');
  box(2.6, 1.0, 0.9, -12, 0.5, 12, 'surface');
  box(2.6, 1.0, 0.9, 12, 0.5, 12, 'surface');

  // Ducts along the side walls.
  box(0.6, 0.6, 24, -21.6, 1.4, 0, 'hairline');
  box(0.6, 0.6, 24, 21.6, 2.4, 0, 'hairline');
  box(0.6, 0.6, 24, -21.6, 3.2, 0, 'hairline');

  // Pipework: spare runs stacked along the north wall, risers in the corners.
  for (const baseX of [-6, 6]) {
    for (const [dy, dz] of [[0.18, 0], [0.18, 0.42], [0.52, 0.21]]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 7, 10), materials.steel);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(baseX, dy, -17.2 + dz);
      prop(pipe);
    }
  }
  for (const [px, pz] of [[-21.4, 17.4], [21.4, 17.4], [-21.4, -17.4], [21.4, -17.4]]) {
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 5, 10), materials.steel);
    riser.position.set(px, 2.5, pz);
    prop(riser);
  }

  // The pipe bridge over Foundry Floor: a deck on two columns, twin pipes
  // along it, and three work lamps slung underneath.
  box(0.5, 3.7, 0.5, -10, 1.85, -2, 'surface');
  box(0.5, 3.7, 0.5, 10, 1.85, -2, 'surface');
  box(21, 0.22, 1.2, 0, 3.72, -2, 'surface');
  for (const [py, pz, pr] of [[4.02, -2.32, 0.14], [4.3, -1.72, 0.1]]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, 21, 10), materials.steel);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, py, pz);
    prop(pipe, false, true);
  }
  for (const lx of [-6, 0, 6]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), materials.soot);
    cord.position.set(lx, 3.36, -2);
    group.add(cord);
    const shadeMesh = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.26, 12, 1, true), materials.soot);
    shadeMesh.position.set(lx, 3.05, -2);
    group.add(shadeMesh);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), lampGlow);
    bulb.position.set(lx, 2.95, -2);
    group.add(bulb);
  }
  const bridgeLight = new THREE.PointLight(new THREE.Color(PALETTE.lamp), 13, 14, 1.8);
  bridgeLight.position.set(0, 2.7, -2);
  scene.add(bridgeLight);

  // A lamp pole watches Relay B from its corner.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.6, 8), materials.steel);
  pole.position.set(20.1, 2.3, -16.9);
  prop(pole);
  const poleArm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.08), materials.steel);
  poleArm.position.set(19.6, 4.55, -16.9);
  group.add(poleArm);
  const poleBulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), lampGlow);
  poleBulb.position.set(19.15, 4.42, -16.9);
  group.add(poleBulb);

  // Relay pylons and ground rings: the plant sites, readable at a glance.
  const rings = {};
  for (const key of ['A', 'B']) {
    const site = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.18, site.radius, 48),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(key === 'A' ? PALETTE.accent : PALETTE.ashen),
        transparent: true, opacity: 0.65, side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.center.x, 0.03, site.center.z);
    group.add(ring);
    rings[key] = ring;
    const pylon = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 2.2, 0.5),
      key === 'A' ? emberGlow : ashenGlow,
    );
    pylon.position.set(site.center.x + (key === 'A' ? 2.6 : -2.6), 1.1, site.center.z - 2.4);
    pylon.castShadow = true;
    group.add(pylon);
    colliders.push(new THREE.Box3().setFromObject(pylon));
    shootables.push(pylon);
  }

  // The planted Spark Charge: hidden until a plant lands.
  const charge = new THREE.Group();
  const chargeBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.36), emberGlow);
  chargeBody.castShadow = true;
  const chargeLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 7);
  chargeLight.position.y = 0.4;
  charge.add(chargeBody, chargeLight);
  charge.visible = false;
  scene.add(charge);

  // Air: embers drifting up off the yard, and smoke over the chimney. Both
  // are pure functions of the clock, so a frozen frame is always the same.
  const EMBERS = 130;
  const emberBase = new Float32Array(EMBERS * 3);
  const emberSpeed = new Float32Array(EMBERS);
  const emberPhase = new Float32Array(EMBERS);
  {
    let s = 1234567;
    const next = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < EMBERS; i += 1) {
      const nearFurnace = i >= 90;
      emberBase[i * 3] = nearFurnace ? (next() * 8 - 4) : (next() * 40 - 20);
      emberBase[i * 3 + 1] = next() * 7;
      emberBase[i * 3 + 2] = nearFurnace ? (next() * 6 - 5) : (next() * 32 - 16);
      emberSpeed[i] = 0.25 + next() * 0.6;
      emberPhase[i] = next() * Math.PI * 2;
    }
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(EMBERS * 3), 3));
  const embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({
    color: new THREE.Color(PALETTE.accent), size: 0.09, map: glowTex, transparent: true,
    opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  embers.frustumCulled = false;
  scene.add(embers);

  const SMOKES = 14;
  const smokes = [];
  for (let i = 0; i < SMOKES; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: new THREE.Color('#7a6248'), transparent: true, opacity: 0, depthWrite: false,
    }));
    scene.add(sprite);
    smokes.push(sprite);
  }

  // Light: a low amber sun from the west, a cool fill from the east, warm sky.
  const sky = new THREE.HemisphereLight(new THREE.Color('#3a2a1a'), new THREE.Color(PALETTE.canvas), 1.6);
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 3.4);
  key.position.set(-18, 11, 8);
  key.target.position.set(2, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 22;
  key.shadow.camera.bottom = -22;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.ashen), 0.7);
  fill.position.set(16, 9, -10);
  scene.add(fill);

  const furnaceLight = new THREE.PointLight(new THREE.Color('#ff7a1a'), 26, 20, 1.6);
  furnaceLight.position.set(0, 1.6, 0.6);
  scene.add(furnaceLight);

  const siteLightA = new THREE.PointLight(new THREE.Color(PALETTE.accent), 5, 10, 1.8);
  siteLightA.position.set(-16, 3, -11);
  scene.add(siteLightA);
  const siteLightB = new THREE.PointLight(new THREE.Color(PALETTE.ashen), 5, 10, 1.8);
  siteLightB.position.set(16, 3, -11);
  scene.add(siteLightB);

  // Which site holds a live Spark, if any: setPlanted('A' | 'B' | null).
  let plantedSite = null;

  return {
    colliders,
    shootables,
    group,
    charge,
    chargeLight,
    rings,
    setPlanted(site) {
      plantedSite = site;
    },
    step(dt, time) {
      // Furnace breath: the glow swells and ebbs; the rings pulse slowly.
      furnaceLight.intensity = 24 + Math.sin(time * 2.3) * 3 + Math.sin(time * 5.1) * 1.2;
      emberGlow.emissiveIntensity = 1.3 + Math.sin(time * 7.3) * 0.25 + Math.sin(time * 13.7) * 0.12;
      bridgeLight.intensity = 13 + Math.sin(time * 11) * 0.5 + Math.sin(time * 23.7) * 0.35;
      // Site rings: a slow breath while the round is live — but a planted
      // site's ring switches to a fast, bright alarm pulse, and its pylon
      // light swells with it, so nobody has to read the HUD to know.
      for (const siteKey of ['A', 'B']) {
        if (siteKey === plantedSite) {
          rings[siteKey].material.opacity = 0.72 + Math.sin(time * 6.5) * 0.28;
        } else {
          rings[siteKey].material.opacity = 0.5 + Math.sin(time * 1.4 + (siteKey === 'B' ? Math.PI : 0)) * 0.15;
        }
      }
      if (plantedSite === 'A') siteLightA.intensity = 9 + Math.sin(time * 6.5) * 4;
      else if (plantedSite === 'B') siteLightB.intensity = 9 + Math.sin(time * 6.5) * 4;
      else {
        siteLightA.intensity = 5;
        siteLightB.intensity = 5;
      }
      // The crane's load sways, barely, on its cables.
      craneSwing.rotation.z = Math.sin(time * 0.55) * 0.03;
      craneSwing.rotation.x = Math.cos(time * 0.42) * 0.02;
      // Embers rise, wrap and drift; smoke climbs off the chimney and thins.
      const pos = emberGeo.attributes.position.array;
      for (let i = 0; i < EMBERS; i += 1) {
        pos[i * 3] = emberBase[i * 3] + Math.sin(time * 0.7 + emberPhase[i]) * 0.45;
        pos[i * 3 + 1] = (emberBase[i * 3 + 1] + time * emberSpeed[i]) % 7.5;
        pos[i * 3 + 2] = emberBase[i * 3 + 2] + Math.cos(time * 0.5 + emberPhase[i]) * 0.45;
      }
      emberGeo.attributes.position.needsUpdate = true;
      for (let i = 0; i < SMOKES; i += 1) {
        const cycle = (time * 0.07 + i / SMOKES) % 1;
        const sprite = smokes[i];
        sprite.position.set(
          3.2 + cycle * 2.4 + Math.sin(time * 0.8 + i * 1.7) * 0.3,
          6.9 + cycle * 5.6,
          -3.2 + cycle * 0.8,
        );
        const scale = 1.7 + cycle * 3.6;
        sprite.scale.set(scale, scale, 1);
        sprite.material.opacity = 0.3 * (cycle < 0.15 ? cycle / 0.15 : 1 - (cycle - 0.15) / 0.85);
      }
    },
  };
}
