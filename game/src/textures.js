// Procedural surface textures, painted once on canvases at boot — no image
// files, no network. Each texture is a small canvas of noise, seams and wear
// in the palette's family of colours, wrapped and repeated by the materials
// in world.js. Signage is painted the same way: a dark plate, a hairline
// border and stencilled lettering, so the yard can label itself in-world.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// A small deterministic scatter so every boot paints the same yard.
function scatter(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeCanvas(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  paint(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function grain(ctx, w, h, rand, base, fleck, count, size) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i += 1) {
    const shade = fleck[Math.floor(rand() * fleck.length)];
    ctx.fillStyle = shade;
    ctx.globalAlpha = 0.12 + rand() * 0.25;
    const s = 1 + rand() * size;
    ctx.fillRect(rand() * w, rand() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

function stains(ctx, w, h, rand, count, colour, maxR) {
  for (let i = 0; i < count; i += 1) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 12 + rand() * maxR;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, colour);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// The yard floor: worn concrete with expansion joints, oil stains and cracks.
export function concreteTexture() {
  const rand = scatter(7101);
  const texture = makeCanvas(512, 512, (ctx, w, h) => {
    grain(ctx, w, h, rand, '#4b3a26', ['#5a4630', '#3c2d1d', '#665236', '#2e2115'], 5200, 3);
    stains(ctx, w, h, rand, 9, 'rgba(16,10,6,0.5)', 90);
    stains(ctx, w, h, rand, 5, 'rgba(255,154,42,0.10)', 60);
    ctx.strokeStyle = 'rgba(20,14,8,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 2; i += 1) {
      ctx.beginPath(); ctx.moveTo((w / 2) * i, 0); ctx.lineTo((w / 2) * i, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (h / 2) * i); ctx.lineTo(w, (h / 2) * i); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(15,10,6,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i += 1) {
      let x = rand() * w;
      let y = rand() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j += 1) {
        x += (rand() - 0.5) * 60;
        y += (rand() - 0.5) * 60;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
  texture.repeat.set(7, 6);
  return texture;
}

// Corrugated sheet for the perimeter walls: vertical ridges, rust weeping
// down from the seams, a darker grime band along the foot.
export function corrugatedTexture() {
  const rand = scatter(9202);
  const texture = makeCanvas(256, 256, (ctx, w, h) => {
    grain(ctx, w, h, rand, '#4a3a28', ['#57462e', '#3a2c1c'], 1600, 2);
    for (let x = 0; x < w; x += 16) {
      const grad = ctx.createLinearGradient(x, 0, x + 16, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.42)');
      grad.addColorStop(0.45, 'rgba(255,230,190,0.13)');
      grad.addColorStop(1, 'rgba(0,0,0,0.42)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, 16, h);
    }
    for (let i = 0; i < 12; i += 1) {
      const x = rand() * w;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(122,62,32,0.5)');
      grad.addColorStop(1, 'rgba(122,62,32,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, 2 + rand() * 3, 60 + rand() * 140);
    }
    const foot = ctx.createLinearGradient(0, h - 60, 0, h);
    foot.addColorStop(0, 'rgba(10,7,4,0)');
    foot.addColorStop(1, 'rgba(10,7,4,0.55)');
    ctx.fillStyle = foot;
    ctx.fillRect(0, h - 60, w, 60);
  });
  texture.repeat.set(9, 1);
  return texture;
}

// Dark plate metal for the furnace, pillars and ducts: panel seams, rivets,
// scratches and heat discolouration.
export function plateMetalTexture() {
  const rand = scatter(3303);
  const texture = makeCanvas(256, 256, (ctx, w, h) => {
    grain(ctx, w, h, rand, '#332619', ['#40301e', '#291d12', '#4a3823'], 2200, 2);
    stains(ctx, w, h, rand, 4, 'rgba(255,122,26,0.13)', 70);
    ctx.strokeStyle = 'rgba(12,8,5,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
    ctx.fillStyle = 'rgba(210,180,130,0.5)';
    for (const [x, y] of [[12, 12], [w - 12, 12], [12, h - 12], [w - 12, h - 12], [w / 2, 12], [w / 2, h - 12]]) {
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(220,190,140,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i += 1) {
      const y = rand() * h;
      ctx.beginPath(); ctx.moveTo(rand() * w * 0.5, y); ctx.lineTo(w * 0.5 + rand() * w * 0.5, y + (rand() - 0.5) * 8); ctx.stroke();
    }
  });
  return texture;
}

// A supply crate: planked faces, a nailed frame and hazard corners. No lettering —
// box UVs face every way at once, and mirrored words would give the game away.
export function crateTexture() {
  const rand = scatter(4404);
  const texture = makeCanvas(256, 256, (ctx, w, h) => {
    grain(ctx, w, h, rand, '#5d452a', ['#6d5334', '#4c3822', '#77592f'], 1800, 3);
    ctx.fillStyle = 'rgba(20,13,7,0.35)';
    for (let y = 62; y < h; y += 64) ctx.fillRect(0, y, w, 3);
    ctx.strokeStyle = '#3a2a16';
    ctx.lineWidth = 18;
    ctx.strokeRect(9, 9, w - 18, h - 18);
    ctx.beginPath(); ctx.moveTo(9, 9); ctx.lineTo(w - 9, h - 9); ctx.stroke();
    ctx.fillStyle = PALETTE.accent;
    for (const [x, y] of [[0, 0], [w - 26, 0], [0, h - 26], [w - 26, h - 26]]) {
      ctx.globalAlpha = 0.75;
      ctx.fillRect(x, y, 26, 26);
    }
    ctx.globalAlpha = 1;
  });
  return texture;
}

// A painted shipping container: vertical ribs, a rusted foot and a faded
// stencil band along the top (abstract bars, not letters, for the same reason).
export function containerTexture(base) {
  const rand = scatter(base === 'rust' ? 5505 : 6606);
  const texture = makeCanvas(256, 256, (ctx, w, h) => {
    grain(ctx, w, h, rand, base === 'rust' ? '#6e3b26' : '#39545a', ['#00000022', '#ffffff14'], 1200, 2);
    for (let x = 0; x < w; x += 22) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x, 0, 4, h);
      ctx.fillStyle = 'rgba(255,235,200,0.10)';
      ctx.fillRect(x + 4, 0, 3, h);
    }
    ctx.fillStyle = 'rgba(242,232,213,0.5)';
    for (let i = 0; i < 6; i += 1) ctx.fillRect(18 + i * 16, 16, 9, 14);
    stains(ctx, w, h, rand, 6, 'rgba(30,16,8,0.45)', 60);
    const foot = ctx.createLinearGradient(0, h - 46, 0, h);
    foot.addColorStop(0, 'rgba(40,20,10,0)');
    foot.addColorStop(1, 'rgba(40,20,10,0.6)');
    ctx.fillStyle = foot;
    ctx.fillRect(0, h - 46, w, 46);
  });
  return texture;
}

// Barrel skin: two rolled ribs and rust patches over dark steel.
export function barrelTexture() {
  const rand = scatter(7707);
  const texture = makeCanvas(128, 128, (ctx, w, h) => {
    grain(ctx, w, h, rand, '#4c3a24', ['#5a4630', '#3a2a18'], 700, 2);
    ctx.fillStyle = 'rgba(14,9,5,0.6)';
    ctx.fillRect(0, 30, w, 5);
    ctx.fillRect(0, 92, w, 5);
    ctx.fillStyle = 'rgba(255,220,170,0.14)';
    ctx.fillRect(0, 35, w, 2);
    ctx.fillRect(0, 97, w, 2);
    stains(ctx, w, h, rand, 5, 'rgba(112,54,26,0.55)', 26);
  });
  return texture;
}

// A wall sign, painted to order: plate, border, a title and a smaller line.
// `tone` is 'accent' for Ember ground, 'ashen' for Ashen ground.
export function signTexture(title, sub, tone = 'accent') {
  return makeCanvas(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#241a10';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = PALETTE[tone];
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.textAlign = 'center';
    const fit = (text, weight, size) => {
      let px = size;
      ctx.font = `${weight} ${px}px system-ui, sans-serif`;
      while (ctx.measureText(text).width > w - 84 && px > 20) {
        px -= 4;
        ctx.font = `${weight} ${px}px system-ui, sans-serif`;
      }
    };
    ctx.fillStyle = PALETTE[tone];
    fit(title, 700, 74);
    ctx.fillText(title, w / 2, sub ? 118 : 148);
    if (sub) {
      ctx.fillStyle = PALETTE.ink;
      fit(sub, 500, 40);
      ctx.fillText(sub, w / 2, 188);
    }
    ctx.fillStyle = 'rgba(242,232,213,0.35)';
    for (const [x, y] of [[30, 30], [w - 30, 30], [30, h - 30], [w - 30, h - 30]]) {
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    }
  });
}

// A soft round sprite for smoke, impact flashes and the sun's glow.
export function glowTexture() {
  return makeCanvas(128, 128, (ctx, w, h) => {
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
}

// The dusk sky as a vertical gradient: soot zenith, ember horizon.
export function skyTexture() {
  const texture = makeCanvas(64, 512, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#120d0a');
    grad.addColorStop(0.42, '#2a1a0e');
    grad.addColorStop(0.72, '#54300f');
    grad.addColorStop(0.92, '#8a5220');
    grad.addColorStop(1, '#a86a2c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
