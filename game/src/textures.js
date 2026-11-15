// DUSTLINE — procedural textures. Everything is drawn on offscreen canvases at
// runtime: no image files, no network. A tiny seeded RNG keeps the speckles
// stable between runs so screenshots stay comparable.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// mulberry32: small deterministic PRNG returning values in [0, 1).
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Scatter n small dots of the given colours over the whole canvas.
function speckles(ctx, r, w, h, n, colours, min, max) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colours[(r() * colours.length) | 0];
    ctx.globalAlpha = 0.25 + r() * 0.55;
    const s = min + r() * (max - min); ctx.fillRect(r() * w, r() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

// Rounded-rect path (avoids relying on ctx.roundRect).
function rr(ctx, x, y, w, h, rad) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  for (const [cx, cy, ex, ey] of [[x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y], [x, y, x + w, y]]) ctx.arcTo(cx, cy, ex, ey, rad);
  ctx.closePath();
}

export function sandTexture() {
  const [c, ctx] = canvas(256, 256);
  const r = rng(11);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(0, 0, 256, 256);
  speckles(ctx, r, 256, 256, 2200, [PALETTE.sandDark, '#d8b37e', '#b98f5c'], 0.5, 1.5);
  return finish(c);
}
export function concreteTexture() {
  const [c, ctx] = canvas(256, 256);
  const r = rng(23);
  ctx.fillStyle = PALETTE.concrete;
  ctx.fillRect(0, 0, 256, 256);
  // soft darker patches
  ctx.fillStyle = PALETTE.concreteDark;
  for (let i = 0; i < 7; i++) {
    ctx.globalAlpha = 0.10 + r() * 0.12;
    ctx.beginPath();
    ctx.ellipse(r() * 256, r() * 256, 30 + r() * 60, 20 + r() * 40, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  speckles(ctx, r, 256, 256, 3200, [PALETTE.concreteDark, '#b3a48f', '#7d7263'], 1, 2);
  // hairline cracks
  ctx.strokeStyle = PALETTE.hairline;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    let x = r() * 256, y = r() * 256;
    ctx.moveTo(x, y);
    for (let j = 0; j < 8; j++) { x += (r() - 0.5) * 70; y += (r() - 0.3) * 50; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return finish(c);
}
export function containerTexture(base) {
  const [c, ctx] = canvas(256, 256);
  const r = rng(37);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  // vertical ribs: alternating light/dark bands every 32px
  for (let x = 0; x < 256; x += 32) {
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x, 0, 8, 256);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x + 16, 0, 8, 256);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 30, 0, 2, 256);
  }
  // top and bottom rails
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(0, 0, 256, 14);
  ctx.fillRect(0, 242, 256, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, 14, 256, 3);
  ctx.fillRect(0, 239, 256, 3);
  // rust streaks running down from the top rail
  ctx.fillStyle = PALETTE.containerRust;
  for (let i = 0; i < 8; i++) {
    ctx.globalAlpha = 0.25 + r() * 0.35;
    ctx.fillRect(r() * 256, 14, 2 + r() * 4, 20 + r() * 90);
  }
  ctx.globalAlpha = 1;
  // scratches
  ctx.strokeStyle = 'rgba(240,230,210,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const x = r() * 256, y = 20 + r() * 210;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 20);
    ctx.stroke();
  }
  return finish(c);
}
export function crateTexture() {
  const [c, ctx] = canvas(256, 256);
  const r = rng(51);
  ctx.fillStyle = PALETTE.wood;
  ctx.fillRect(0, 0, 256, 256);
  // horizontal planks with gaps
  const ph = 64;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, i * ph, 256, ph);
    ctx.fillStyle = 'rgba(40,26,12,0.85)'; ctx.fillRect(0, i * ph + ph - 3, 256, 3);
  }
  // grain streaks
  ctx.strokeStyle = 'rgba(60,40,18,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const y = r() * 256;
    ctx.beginPath(); ctx.moveTo(0, y);
    ctx.bezierCurveTo(85, y + (r() - 0.5) * 8, 170, y + (r() - 0.5) * 8, 256, y + (r() - 0.5) * 6);
    ctx.stroke();
  }
  // darker frame border
  ctx.strokeStyle = 'rgba(50,32,14,0.9)';
  ctx.lineWidth = 18;
  ctx.strokeRect(9, 9, 238, 238);
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 2;
  ctx.strokeRect(19, 19, 218, 218);
  // nail dots at the corners
  ctx.fillStyle = '#2e2113';
  for (const [x, y] of [[26, 26], [230, 26], [26, 230], [230, 230]]) {
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  }
  return finish(c);
}
export function sandbagTexture() {
  const [c, ctx] = canvas(256, 256);
  const r = rng(67);
  ctx.fillStyle = PALETTE.sandDark;
  ctx.fillRect(0, 0, 256, 256);
  const bh = 256 / 6;
  for (let row = 0; row < 6; row++) {
    const off = row % 2 ? 32 : 0;
    for (let x = -64; x < 256; x += 64) {
      const bx = x + off;
      ctx.fillStyle = r() < 0.5 ? PALETTE.sand : PALETTE.sandDark;
      rr(ctx, bx + 3, row * bh + 4, 58, bh - 8, 12);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      rr(ctx, bx + 8, row * bh + 7, 48, 8, 6); ctx.fill();
    }
  }
  speckles(ctx, r, 256, 256, 900, [PALETTE.sandDark, '#d8b37e'], 1, 2);
  return finish(c);
}
export function metalTexture() {
  const [c, ctx] = canvas(128, 128);
  const r = rng(83);
  ctx.fillStyle = PALETTE.metal;
  ctx.fillRect(0, 0, 128, 128);
  // horizontal brushed bands
  for (let y = 0; y < 128; y += 2) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, y, 128, 1);
  }
  // a few scratches
  ctx.strokeStyle = 'rgba(200,210,220,0.30)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const x = r() * 128, y = r() * 128;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + 20 + r() * 40, y + (r() - 0.5) * 10);
    ctx.stroke();
  }
  return finish(c);
}
export function skyTexture() {
  const [c, ctx] = canvas(512, 256);
  const r = rng(97);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [o, col] of [[0, PALETTE.skyTop], [0.45, '#4a4458'], [0.68, '#8a5a52'], [0.8, PALETTE.skyHorizon], [1, '#c97a3e']]) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  // low sun glow, slightly left of centre at the horizon
  const sun = ctx.createRadialGradient(200, 200, 4, 200, 200, 130);
  for (const [o, col] of [[0, 'rgba(255,214,138,0.95)'], [0.25, 'rgba(255,170,90,0.55)'], [1, 'rgba(255,150,70,0)']]) sun.addColorStop(o, col);
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = 'rgba(255,228,170,0.95)';
  ctx.beginPath(); ctx.arc(200, 200, 14, 0, Math.PI * 2); ctx.fill();
  // faint horizontal cloud streaks
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = `rgba(220,200,220,${0.05 + r() * 0.08})`;
    ctx.beginPath(); ctx.ellipse(60 + r() * 390, 30 + r() * 130, 40 + r() * 80, 3 + r() * 5, 0, 0, Math.PI * 2); ctx.fill();
  }
  return finish(c);
}
export function siteTexture(letter) {
  const [c, ctx] = canvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  // dashed ring around the letter
  ctx.strokeStyle = PALETTE.accent;
  ctx.lineWidth = 10;
  ctx.setLineDash([22, 14]);
  ctx.beginPath(); ctx.arc(128, 128, 104, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  // bold letter with a dark outline
  ctx.font = 'bold 150px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(40,26,12,0.9)';
  ctx.strokeText(letter, 128, 134);
  ctx.fillStyle = PALETTE.accent;
  ctx.fillText(letter, 128, 134);
  return finish(c);
}
