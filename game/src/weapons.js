// The armoury: five guns and a grenade, each with its own numbers and view model.
// A weapon owns its magazine, cooldown and reload; main.js owns the ray and the
// damage. Spread grows with movement and with sustained fire, so stopping to aim
// pays; the headshot multiplier lives in main.js, next to the ray.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = [
  {
    id: 'pistol', name: 'P-9 Sidearm', kind: 'pistol', price: 0,
    mag: 12, reserve: 36, damage: 26, headMult: 4, fireGap: 0.16, reloadTime: 1.3,
    spreadStill: 0.004, spreadMove: 0.02, spreadBloom: 0.006, auto: false,
    range: 45, falloff: 0.55, kick: 0.006,
  },
  {
    id: 'smg', name: 'Rook-9', kind: 'smg', price: 1500,
    mag: 28, reserve: 84, damage: 22, headMult: 4, fireGap: 0.077, reloadTime: 1.7,
    spreadStill: 0.008, spreadMove: 0.03, spreadBloom: 0.009, auto: true,
    range: 38, falloff: 0.5, kick: 0.007,
  },
  {
    id: 'rifle', name: 'Longbow-7', kind: 'rifle', price: 2700,
    mag: 25, reserve: 75, damage: 34, headMult: 4, fireGap: 0.1, reloadTime: 2.1,
    spreadStill: 0.0022, spreadMove: 0.028, spreadBloom: 0.007, auto: true,
    range: 70, falloff: 0.7, kick: 0.011,
  },
  {
    id: 'shotgun', name: 'Breacher-12', kind: 'shotgun', price: 1400,
    mag: 6, reserve: 24, damage: 9, headMult: 3, fireGap: 0.85, reloadTime: 2.4,
    spreadStill: 0.03, spreadMove: 0.045, spreadBloom: 0.01, auto: false, pellets: 8,
    range: 22, falloff: 0.35, kick: 0.03,
  },
  {
    id: 'sniper', name: 'Needle-50', kind: 'sniper', price: 4750,
    mag: 5, reserve: 15, damage: 95, headMult: 4, fireGap: 1.15, reloadTime: 2.8,
    spreadStill: 0.0008, spreadMove: 0.05, spreadBloom: 0.02, auto: false,
    range: 90, falloff: 0.9, kick: 0.035,
  },
];

export const GRENADE = { id: 'grenade', name: 'Spark Grenade', price: 300, damage: 95, radius: 6.5 };
export const FLASH = { id: 'flash', name: 'Flash Charge', price: 200, radius: 10, blind: 2.4 };
export const ARMOR = { id: 'armor', name: 'Plate Vest', price: 650, value: 50 };

const MUZZLE_TIME = 0.06;

// One view model per gun, built from boxes: receiver, barrel, grip and stock,
// then dressed per gun — magazine, sights, rail, muzzle brake, and the parts
// that make each one itself (the Rook's foregrip, the Breacher's pump and
// shell carrier, the Needle's scope and bipod). Only the selected one is
// visible; the rest stay hidden, never rebuilt.
function buildViewModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.soot), roughness: 0.6, metalness: 0.3 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.2 });
  const model = new THREE.Group();
  const sizes = {
    pistol: { receiver: [0.07, 0.09, 0.22], barrel: [0.04, 0.04, 0.12], stock: [0.06, 0.09, 0.1] },
    smg: { receiver: [0.08, 0.1, 0.34], barrel: [0.04, 0.04, 0.22], stock: [0.07, 0.08, 0.16] },
    rifle: { receiver: [0.09, 0.1, 0.42], barrel: [0.045, 0.045, 0.4], stock: [0.075, 0.08, 0.22] },
    shotgun: { receiver: [0.1, 0.11, 0.4], barrel: [0.06, 0.06, 0.42], stock: [0.08, 0.09, 0.2] },
    sniper: { receiver: [0.09, 0.11, 0.5], barrel: [0.04, 0.04, 0.55], stock: [0.075, 0.08, 0.24] },
  }[def.id] || { receiver: [0.09, 0.1, 0.4], barrel: [0.045, 0.045, 0.4], stock: [0.075, 0.08, 0.2] };
  const [rw, rh, rl] = sizes.receiver;
  const part = (w, h, d, x, y, z, mat = body) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    model.add(mesh);
    return mesh;
  };
  part(rw, rh, rl, 0, 0, 0); // receiver
  part(...sizes.barrel, 0, 0.025, -(rl / 2 + sizes.barrel[2] / 2 - 0.02), grip); // barrel
  part(...sizes.stock, 0, -0.02, rl / 2 + sizes.stock[2] / 2 - 0.04, grip); // stock / grip
  part(0.02, 0.02, rl * 0.7, rw / 2 + 0.005, 0.02, 0, accent); // ember stripe
  const barrelTip = -(rl / 2 + sizes.barrel[2] - 0.02);
  // Furniture every gun shares: magazine, sights, rail, muzzle brake.
  if (def.id !== 'pistol') part(rw * 0.62, 0.13, 0.07, 0, -rh / 2 - 0.055, 0.02, dark);
  else part(0.05, 0.1, 0.06, 0, -rh / 2 - 0.04, 0.03, dark);
  part(0.012, 0.045, 0.012, 0, rh / 2 + 0.035, barrelTip + 0.03, dark); // front post
  part(0.05, 0.03, 0.02, 0, rh / 2 + 0.025, rl / 2 - 0.05, dark); // rear sight
  part(rw * 0.5, 0.015, rl * 0.8, 0, rh / 2 + 0.008, 0, grip); // top rail
  part(sizes.barrel[0] * 1.5, sizes.barrel[1] * 1.5, 0.07, 0, 0.025, barrelTip, dark); // brake
  if (def.id === 'pistol') {
    part(0.03, 0.04, 0.03, 0, 0.03, rl / 2 + 0.01, dark); // hammer
    part(0.055, 0.02, 0.05, 0, -0.01, rl / 2 + 0.045, grip); // beavertail
  }
  if (def.id === 'smg') {
    part(0.045, 0.11, 0.045, 0, -0.1, -rl / 2 - 0.08, grip); // foregrip
    part(0.05, 0.05, 0.16, 0, 0.02, -rl / 2 - 0.02, dark); // shroud
  }
  if (def.id === 'rifle') {
    part(0.04, 0.1, 0.04, 0, -0.095, -rl / 2 - 0.1, grip); // foregrip
    part(0.02, 0.05, 0.3, rw / 2 + 0.01, -0.01, -0.05, dark); // heat shield
  }
  if (def.id === 'shotgun') {
    part(0.075, 0.06, 0.18, 0, -0.045, -rl / 2 - 0.16, grip); // pump
    for (let i = 0; i < 3; i += 1) part(0.025, 0.035, 0.07, rw / 2 + 0.012, -0.01, -0.08 + i * 0.08, accent); // shells
  }
  if (def.id === 'sniper') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.22, 10), dark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, rh / 2 + 0.055, -0.02);
    model.add(scope);
    part(0.02, 0.035, 0.02, 0, rh / 2 + 0.02, -0.1, dark); // scope mounts
    part(0.02, 0.035, 0.02, 0, rh / 2 + 0.02, 0.06, dark);
    part(0.07, 0.04, 0.12, 0, 0.045, rl / 2 - 0.02, grip); // cheek rest
    for (const side of [-1, 1]) {
      const leg = part(0.012, 0.16, 0.012, side * 0.045, -0.1, barrelTip + 0.12, dark);
      leg.rotation.z = side * 0.5; // bipod, splayed
    }
  }
  model.position.set(0.24, -0.2, -0.42);
  model.visible = false;
  return model;
}

export function createWeaponSystem(camera) {
  const models = WEAPONS.map((def) => {
    const model = buildViewModel(def);
    camera.add(model);
    return model;
  });

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.17, 0.17),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  // One ammo state per gun; the player keeps what they bought between rounds.
  const owned = WEAPONS.map((def) => ({ def, mag: def.mag, reserve: def.reserve }));
  let current = 0;
  let cooldown = 0;
  let reloadLeft = 0;
  let flashLeft = 0;
  let kick = 0;
  let bloom = 0;
  let swayTime = 0;
  models[0].visible = true;

  function state() {
    return owned[current];
  }

  function step(dt) {
    cooldown = Math.max(0, cooldown - dt);
    flashLeft = Math.max(0, flashLeft - dt);
    bloom = Math.max(0, bloom - dt * 0.03);
    kick += (0 - kick) * Math.min(1, dt * 14);
    swayTime += dt;
    const model = models[current];
    // Breathing sway: the gun is held, not bolted to the camera.
    model.position.x = 0.24 + Math.sin(swayTime * 1.25) * 0.0028;
    model.position.y = -0.2 + Math.sin(swayTime * 2.5) * 0.0022;
    model.position.z = -0.42 + kick;
    model.rotation.x = kick * 2.2;
    model.rotation.z = Math.sin(swayTime * 1.25) * 0.004;
    flash.visible = flashLeft > 0;
    flash.rotation.z = flashLeft * 30;
    flashLight.intensity = flashLeft > 0 ? 18 : 0;
    if (reloadLeft > 0) {
      reloadLeft = Math.max(0, reloadLeft - dt);
      const def = state().def;
      model.rotation.x = -0.55 * Math.min(1, (def.reloadTime - reloadLeft) * 2);
      if (reloadLeft === 0) {
        const need = def.mag - state().mag;
        const take = Math.min(need, state().reserve);
        state().mag += take;
        state().reserve -= take;
      }
    }
  }

  return {
    owned,
    get current() {
      return current;
    },
    def() {
      return state().def;
    },
    mag() {
      return state().mag;
    },
    reserve() {
      return state().reserve;
    },
    step,
    ready() {
      return state().mag > 0 && cooldown === 0 && reloadLeft === 0;
    },
    reloading() {
      return reloadLeft > 0;
    },
    pullTrigger() {
      cooldown = state().def.fireGap;
      flashLeft = MUZZLE_TIME;
      kick = 0.055;
      bloom = Math.min(0.03, bloom + state().def.spreadBloom);
    },
    takeRound() {
      if (state().mag <= 0) return false;
      state().mag -= 1;
      return true;
    },
    reload() {
      const s = state();
      if (reloadLeft > 0 || s.mag === s.def.mag || s.reserve === 0) return false;
      reloadLeft = s.def.reloadTime;
      return true;
    },
    spread(speed) {
      const def = state().def;
      return def.spreadStill + Math.min(1, speed / 5.2) * def.spreadMove + bloom;
    },
    select(index) {
      if (index === current || index < 0 || index >= WEAPONS.length) return false;
      if (index !== 0 && !owned[index].bought) return false;
      models[current].visible = false;
      current = index;
      models[current].visible = true;
      reloadLeft = 0;
      cooldown = Math.max(cooldown, 0.15);
      return true;
    },
    buy(index) {
      const s = owned[index];
      if (s.bought) return 0;
      s.bought = true;
      s.mag = s.def.mag;
      s.reserve = s.def.reserve;
      return s.def.price;
    },
    has(index) {
      return index === 0 || owned[index].bought;
    },
    refillAmmo() {
      for (const s of owned) {
        if (s.bought || s.def.price === 0) {
          s.mag = s.def.mag;
          s.reserve = s.def.reserve;
        }
      }
      reloadLeft = 0;
      cooldown = 0;
    },
    reset() {
      for (const s of owned) {
        s.bought = false;
        s.mag = s.def.mag;
        s.reserve = s.def.reserve;
      }
      owned[0].bought = true;
      models[current].visible = false;
      current = 0;
      models[0].visible = true;
      reloadLeft = 0;
      cooldown = 0;
      bloom = 0;
    },
  };
}
