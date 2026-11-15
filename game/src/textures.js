// DUSTLINE — procedural textures. Everything is drawn on offscreen canvases at
// runtime: no image files, no network. A tiny seeded RNG keeps the speckles
// stable between runs so screenshots stay comparable. All canvases are HD
// (512px, sand 1024x1024, sky 1024x512) so surfaces stay sharp at 1280x720;
// anisotropy is 8 so ground textures stay crisp at grazing angles.
// Look: weathered and muted, not flat or plastic — desert dust, olive drab,
// concrete grey and rust, mid-tone so the warm dusk sun and cool shadows read.
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
  t.anisotropy = 8;
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
  const S = 1024;
  const [c, ctx] = canvas(S, S);
  const r = rng(11);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(0, 0, S, S);
  // large soft dirt patches: darker brown/tan blotches so no area is flat
  const patchCols = ['#a87f4e', '#8f6a3f', '#b98f5c', '#d8b37e', '#96703f'];
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = patchCols[(r() * patchCols.length) | 0];
    ctx.globalAlpha = 0.07 + r() * 0.10;
    ctx.beginPath();
    ctx.ellipse(r() * S, r() * S, 80 + r() * 220, 50 + r() * 130, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // finer mottling: medium soft blotches so the tone keeps shifting
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = r() < 0.5 ? '#b98f5c' : '#d8b37e';
    ctx.globalAlpha = 0.05 + r() * 0.08;
    ctx.beginPath();
    ctx.ellipse(r() * S, r() * S, 20 + r() * 60, 14 + r() * 40, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // foot-worn paths: wide soft wandering bands, slightly darker and packed
  ctx.strokeStyle = 'rgba(140,105,60,0.10)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.lineWidth = 26 + r() * 30;
    const y = r() * S;
    ctx.beginPath(); ctx.moveTo(-20, y);
    ctx.bezierCurveTo(S * 0.3, y + (r() - 0.5) * 160, S * 0.7, y + (r() - 0.5) * 160, S + 20, y + (r() - 0.5) * 120);
    ctx.stroke();
  }
  // faint tire-track arcs: pairs of parallel curved ruts with a pale lip
  for (let i = 0; i < 3; i++) {
    const cx = r() * S, cy = r() * S, rad = 260 + r() * 420;
    const a0 = r() * Math.PI * 2, a1 = a0 + 0.7 + r() * 0.9;
    for (const off of [-14, 14]) {
      ctx.strokeStyle = 'rgba(110,82,44,0.13)';
      ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(cx, cy, rad + off, a0, a1); ctx.stroke();
      ctx.strokeStyle = 'rgba(232,200,143,0.10)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy, rad + off - 7, a0, a1); ctx.stroke();
    }
  }
  // wind-blown ripple lines
  ctx.strokeStyle = 'rgba(120,90,50,0.16)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const y = r() * S;
    ctx.beginPath(); ctx.moveTo(0, y);
    ctx.bezierCurveTo(S * 0.33, y + (r() - 0.5) * 18, S * 0.66, y + (r() - 0.5) * 18, S, y + (r() - 0.5) * 14);
    ctx.stroke();
  }
  speckles(ctx, r, S, S, 12000, [PALETTE.sandDark, '#d8b37e', '#b98f5c', '#e8c88f'], 1, 3);
  // scattered pebbles: small dark dots with a light rim
  for (let i = 0; i < 220; i++) {
    const x = r() * S, y = r() * S, s = 1.5 + r() * 3;
    ctx.fillStyle = 'rgba(90,66,38,0.55)';
    ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,235,200,0.4)';
    ctx.beginPath(); ctx.arc(x - s * 0.3, y - s * 0.3, s * 0.45, 0, Math.PI * 2); ctx.fill();
  }
  return finish(c);
}
export function concreteTexture() {
  const [c, ctx] = canvas(512, 512);
  const r = rng(23);
  ctx.fillStyle = PALETTE.concrete;
  ctx.fillRect(0, 0, 512, 512);
  // soft darker patches
  ctx.fillStyle = PALETTE.concreteDark;
  for (let i = 0; i < 10; i++) {
    ctx.globalAlpha = 0.10 + r() * 0.12;
    ctx.beginPath();
    ctx.ellipse(r() * 512, r() * 512, 60 + r() * 120, 40 + r() * 80, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // grime streaks running down from the top edge, fading as they go
  for (let i = 0; i < 12; i++) {
    const x = r() * 512, wdt = 4 + r() * 12, len = 100 + r() * 320;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(48,40,30,0.22)');
    g.addColorStop(1, 'rgba(48,40,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, wdt, len);
  }
  // formwork panel lines + tie holes (poured-concrete shuttering marks)
  ctx.fillStyle = 'rgba(60,50,40,0.18)';
  ctx.fillRect(0, 127, 512, 2); ctx.fillRect(0, 383, 512, 2);
  ctx.fillRect(127, 0, 2, 512); ctx.fillRect(383, 0, 2, 512);
  for (const gx of [64, 192, 320, 448]) for (const gy of [64, 192, 320, 448]) {
    ctx.fillStyle = 'rgba(50,42,32,0.35)';
    ctx.beginPath(); ctx.arc(gx, gy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(230,220,200,0.15)';
    ctx.beginPath(); ctx.arc(gx - 1, gy - 1, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  speckles(ctx, r, 512, 512, 8000, [PALETTE.concreteDark, '#b3a48f', '#7d7263', '#c9bba4'], 1, 3);
  // chipped edges: darker speckles hugging the borders
  for (let i = 0; i < 300; i++) {
    const edge = (r() * 4) | 0;
    let x, y;
    if (edge === 0) { x = r() * 512; y = r() * 18; }
    else if (edge === 1) { x = r() * 512; y = 494 + r() * 18; }
    else if (edge === 2) { x = r() * 18; y = r() * 512; }
    else { x = 494 + r() * 18; y = r() * 512; }
    ctx.fillStyle = 'rgba(58,48,38,0.35)';
    ctx.globalAlpha = 0.3 + r() * 0.5;
    const s = 1 + r() * 3;
    ctx.fillRect(x, y, s, s);
  }
  ctx.globalAlpha = 1;
  // expansion-joint grid: one vertical and one horizontal seam
  ctx.fillStyle = 'rgba(40,32,24,0.5)';
  ctx.fillRect(255, 0, 3, 512);
  ctx.fillRect(0, 255, 512, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(258, 0, 2, 512);
  ctx.fillRect(0, 258, 512, 2);
  // hairline cracks, a few branching
  ctx.strokeStyle = PALETTE.hairline;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    let x = r() * 512, y = r() * 512;
    ctx.moveTo(x, y);
    for (let j = 0; j < 10; j++) { x += (r() - 0.5) * 90; y += (r() - 0.3) * 70; ctx.lineTo(x, y); }
    ctx.stroke();
    // short branch off the crack's midpoint
    if (r() < 0.6) {
      ctx.beginPath();
      ctx.moveTo(x * 0.5 + 60, y * 0.5 + 40);
      ctx.lineTo(x * 0.5 + 60 + (r() - 0.5) * 70, y * 0.5 + 40 + (r() - 0.5) * 70);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // rust stains pooling near the bottom edge
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = PALETTE.containerRust;
    ctx.globalAlpha = 0.10 + r() * 0.14;
    ctx.beginPath();
    ctx.ellipse(r() * 512, 430 + r() * 82, 8 + r() * 22, 5 + r() * 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // small pits
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = 'rgba(60,50,40,0.35)';
    ctx.beginPath(); ctx.arc(r() * 512, r() * 512, 1 + r() * 2.5, 0, Math.PI * 2); ctx.fill();
  }
  return finish(c);
}
export function containerTexture(base) {
  const [c, ctx] = canvas(512, 512);
  const r = rng(37);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  // vertical ribs: alternating light/dark bands every 64px
  for (let x = 0; x < 512; x += 64) {
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x, 0, 16, 512);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x + 32, 0, 16, 512);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 60, 0, 4, 512);
  }
  // sun-faded paint: large soft bleached / shaded patches so the colour is uneven
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(240,225,190,0.07)' : 'rgba(20,16,10,0.07)';
    ctx.globalAlpha = 0.5 + r() * 0.5;
    ctx.beginPath();
    ctx.ellipse(r() * 512, r() * 512, 50 + r() * 120, 30 + r() * 80, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // top and bottom rails
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(0, 0, 512, 28);
  ctx.fillRect(0, 484, 512, 28);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, 28, 512, 6);
  ctx.fillRect(0, 478, 512, 6);
  // rivets along both rails
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  for (let x = 16; x < 512; x += 32) {
    ctx.beginPath(); ctx.arc(x, 14, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, 498, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (let x = 16; x < 512; x += 32) {
    ctx.beginPath(); ctx.arc(x - 1, 13, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - 1, 497, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  // rust weeping down from the top-rail rivets
  ctx.fillStyle = PALETTE.containerRust;
  for (let x = 16; x < 512; x += 32) {
    if (r() < 0.55) {
      ctx.globalAlpha = 0.18 + r() * 0.25;
      ctx.fillRect(x - 3, 20, 6, 20 + r() * 60);
    }
  }
  ctx.globalAlpha = 1;
  // rust streaks running down from the top rail
  ctx.fillStyle = PALETTE.containerRust;
  for (let i = 0; i < 12; i++) {
    ctx.globalAlpha = 0.25 + r() * 0.35;
    ctx.fillRect(r() * 512, 28, 4 + r() * 8, 40 + r() * 180);
  }
  ctx.globalAlpha = 1;
  // rust patches near the bottom rail
  for (let i = 0; i < 14; i++) {
    ctx.globalAlpha = 0.15 + r() * 0.2;
    ctx.beginPath();
    ctx.ellipse(r() * 512, 440 + r() * 60, 10 + r() * 26, 6 + r() * 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // rust creeping in from the side edges
  for (let i = 0; i < 6; i++) {
    ctx.globalAlpha = 0.12 + r() * 0.18;
    ctx.beginPath();
    ctx.ellipse(r() < 0.5 ? r() * 20 : 492 + r() * 20, r() * 512, 6 + r() * 14, 10 + r() * 26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // dents: soft dark hollow with a pale upper lip
  for (let i = 0; i < 7; i++) {
    const x = r() * 512, y = 60 + r() * 380;
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.beginPath(); ctx.ellipse(x, y, 14 + r() * 26, 8 + r() * 14, r() * Math.PI, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,210,0.10)';
    ctx.beginPath(); ctx.ellipse(x, y - 4, 12 + r() * 20, 5 + r() * 8, r() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
  // grime band pooling along the bottom edge
  const grime = ctx.createLinearGradient(0, 420, 0, 512);
  grime.addColorStop(0, 'rgba(30,22,14,0)');
  grime.addColorStop(1, 'rgba(30,22,14,0.28)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, 420, 512, 92);
  // scratches
  ctx.strokeStyle = 'rgba(240,230,210,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 10; i++) {
    const x = r() * 512, y = 40 + r() * 420;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * 120, y + (r() - 0.5) * 40);
    ctx.stroke();
  }
  speckles(ctx, r, 512, 512, 1200, ['rgba(0,0,0,0.35)', 'rgba(255,255,255,0.25)'], 1, 2);
  return finish(c);
}
export function crateTexture() {
  const [c, ctx] = canvas(512, 512);
  const r = rng(51);
  ctx.fillStyle = PALETTE.wood;
  ctx.fillRect(0, 0, 512, 512);
  // horizontal planks with gaps
  const ph = 128;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, i * ph, 512, ph);
    ctx.fillStyle = 'rgba(40,26,12,0.85)'; ctx.fillRect(0, i * ph + ph - 6, 512, 6);
    // plank end seams: staggered vertical joints
    ctx.fillStyle = 'rgba(40,26,12,0.6)';
    ctx.fillRect(((i * 173) % 512), i * ph, 4, ph);
  }
  // weathered grey-brown blotches so the stain is uneven
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(96,84,60,0.12)' : 'rgba(60,44,22,0.12)';
    ctx.globalAlpha = 0.5 + r() * 0.5;
    ctx.beginPath();
    ctx.ellipse(r() * 512, r() * 512, 30 + r() * 80, 18 + r() * 50, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // wood grain streaks
  ctx.strokeStyle = 'rgba(60,40,18,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 80; i++) {
    const y = r() * 512;
    ctx.beginPath(); ctx.moveTo(0, y);
    ctx.bezierCurveTo(170, y + (r() - 0.5) * 16, 340, y + (r() - 0.5) * 16, 512, y + (r() - 0.5) * 12);
    ctx.stroke();
  }
  // darker grain lines following the plank direction, with a few wobbles
  ctx.strokeStyle = 'rgba(52,34,14,0.28)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 24; i++) {
    const y = r() * 512;
    ctx.beginPath(); ctx.moveTo(0, y);
    ctx.bezierCurveTo(130, y + (r() - 0.5) * 10, 380, y + (r() - 0.5) * 10, 512, y + (r() - 0.5) * 8);
    ctx.stroke();
  }
  // grain knots
  for (let i = 0; i < 6; i++) {
    const x = r() * 512, y = r() * 512;
    ctx.strokeStyle = 'rgba(50,32,14,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, 8 + r() * 8, 5 + r() * 5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, y, 3 + r() * 3, 2 + r() * 2, 0, 0, Math.PI * 2); ctx.stroke();
  }
  // faded stencil marking: lot number + arrow, worn paint
  ctx.save();
  ctx.translate(256, 256);
  ctx.rotate(-0.06);
  ctx.font = 'bold 64px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(52,36,16,0.42)';
  ctx.fillText('A-17', 0, -30);
  ctx.fillRect(-8, 18, 16, 46);
  ctx.beginPath(); ctx.moveTo(-26, 62); ctx.lineTo(26, 62); ctx.lineTo(0, 96); ctx.closePath(); ctx.fill();
  ctx.restore();
  // darker frame border
  ctx.strokeStyle = 'rgba(50,32,14,0.9)';
  ctx.lineWidth = 36;
  ctx.strokeRect(18, 18, 476, 476);
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 4;
  ctx.strokeRect(38, 38, 436, 436);
  // chipped corners: dark worn chips + pale flecks of raw wood
  for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [512, 0, -1, 1], [0, 512, 1, -1], [512, 512, -1, -1]]) {
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = 'rgba(46,32,14,0.5)';
      ctx.globalAlpha = 0.3 + r() * 0.5;
      ctx.fillRect(cx + sx * r() * 46, cy + sy * r() * 46, 2 + r() * 5, 2 + r() * 5);
    }
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = 'rgba(214,178,124,0.5)';
      ctx.globalAlpha = 0.3 + r() * 0.4;
      ctx.fillRect(cx + sx * r() * 34, cy + sy * r() * 34, 2 + r() * 4, 1 + r() * 3);
    }
  }
  ctx.globalAlpha = 1;
  // nail dots at the corners and plank ends
  ctx.fillStyle = '#2e2113';
  for (const [x, y] of [[52, 52], [460, 52], [52, 460], [460, 460], [52, 192], [460, 192], [52, 320], [460, 320]]) {
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(x - 2, y - 2, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2e2113';
  }
  return finish(c);
}
export function sandbagTexture() {
  const [c, ctx] = canvas(512, 512);
  const r = rng(67);
  ctx.fillStyle = PALETTE.sandDark;
  ctx.fillRect(0, 0, 512, 512);
  const bh = 512 / 6;
  const shades = [PALETTE.sand, PALETTE.sandDark, '#b59a68'];
  for (let row = 0; row < 6; row++) {
    const off = row % 2 ? 64 : 0;
    for (let x = -128; x < 512; x += 128) {
      const bx = x + off;
      // per-bag shade variation
      ctx.fillStyle = shades[(r() * shades.length) | 0];
      rr(ctx, bx + 6, row * bh + 8, 116, bh - 16, 24);
      ctx.fill();
      // top highlight and bottom shade so each bag reads as a lump
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      rr(ctx, bx + 16, row * bh + 14, 96, 16, 12); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      rr(ctx, bx + 10, row * bh + bh - 22, 108, 10, 5); ctx.fill();
      // dirt smudge on the belly of the bag
      ctx.fillStyle = 'rgba(74,56,32,0.16)';
      ctx.beginPath();
      ctx.ellipse(bx + 20 + r() * 70, row * bh + bh * 0.55 + r() * 14, 12 + r() * 22, 5 + r() * 8, 0, 0, Math.PI * 2);
      ctx.fill();
      // stitched seam across the bag
      ctx.strokeStyle = 'rgba(60,44,24,0.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(bx + 10, row * bh + bh / 2); ctx.lineTo(bx + 118, row * bh + bh / 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // burlap weave: fine crosshatch over the whole canvas
  ctx.strokeStyle = 'rgba(60,44,24,0.05)';
  ctx.lineWidth = 1;
  for (let y = 0; y < 512; y += 3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
  for (let x = 0; x < 512; x += 3) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); }
  // dirt smudges scattered across the wall
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(74,56,32,0.16)' : 'rgba(120,96,58,0.14)';
    ctx.globalAlpha = 0.5 + r() * 0.5;
    ctx.beginPath();
    ctx.ellipse(r() * 512, r() * 512, 10 + r() * 34, 6 + r() * 18, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  speckles(ctx, r, 512, 512, 1800, [PALETTE.sandDark, '#d8b37e'], 1, 3);
  return finish(c);
}
export function metalTexture() {
  const [c, ctx] = canvas(512, 512);
  const r = rng(83);
  ctx.fillStyle = PALETTE.metal;
  ctx.fillRect(0, 0, 512, 512);
  // horizontal brushed bands
  for (let y = 0; y < 512; y += 4) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, y, 512, 2);
  }
  // panel seams every 128px with rivets
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (const x of [128, 256, 384]) ctx.fillRect(x, 0, 3, 512);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  for (const x of [131, 259, 387]) ctx.fillRect(x, 0, 2, 512);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  for (const x of [112, 144, 240, 272, 368, 400]) {
    for (let y = 24; y < 512; y += 64) {
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    }
  }
  // rust blooming along the panel seams
  ctx.fillStyle = PALETTE.containerRust;
  for (let i = 0; i < 26; i++) {
    const seamX = [128, 256, 384][(r() * 3) | 0] + (r() - 0.5) * 14;
    ctx.globalAlpha = 0.10 + r() * 0.20;
    ctx.beginPath();
    ctx.ellipse(seamX, r() * 512, 4 + r() * 12, 6 + r() * 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // rust pooling near the bottom edge
  for (let i = 0; i < 10; i++) {
    ctx.globalAlpha = 0.12 + r() * 0.18;
    ctx.beginPath();
    ctx.ellipse(r() * 512, 470 + r() * 42, 12 + r() * 26, 5 + r() * 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // oil / grime stains
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = 'rgba(18,16,12,0.16)';
    ctx.globalAlpha = 0.5 + r() * 0.5;
    ctx.beginPath();
    ctx.ellipse(r() * 512, r() * 512, 16 + r() * 44, 10 + r() * 26, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // a few scratches
  ctx.strokeStyle = 'rgba(200,210,220,0.30)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const x = r() * 512, y = r() * 512;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + 40 + r() * 80, y + (r() - 0.5) * 20);
    ctx.stroke();
  }
  speckles(ctx, r, 512, 512, 1500, ['rgba(255,255,255,0.2)', 'rgba(0,0,0,0.3)'], 1, 2);
  return finish(c);
}
export function skyTexture() {
  const [c, ctx] = canvas(1024, 512);
  const r = rng(97);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  for (const [o, col] of [[0, PALETTE.skyTop], [0.45, '#4a4458'], [0.68, '#8a5a52'], [0.8, PALETTE.skyHorizon], [1, '#c97a3e']]) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);
  // low sun glow, slightly left of centre at the horizon
  const sun = ctx.createRadialGradient(400, 400, 8, 400, 400, 260);
  for (const [o, col] of [[0, 'rgba(255,214,138,0.95)'], [0.25, 'rgba(255,170,90,0.55)'], [1, 'rgba(255,150,70,0)']]) sun.addColorStop(o, col);
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = 'rgba(255,228,170,0.95)';
  ctx.beginPath(); ctx.arc(400, 400, 28, 0, Math.PI * 2); ctx.fill();
  // faint horizontal cloud streaks
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = `rgba(220,200,220,${0.05 + r() * 0.08})`;
    ctx.beginPath(); ctx.ellipse(120 + r() * 780, 60 + r() * 260, 80 + r() * 160, 6 + r() * 10, 0, 0, Math.PI * 2); ctx.fill();
  }
  // a few brighter cloud wisps near the sun
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(255,200,150,${0.10 + r() * 0.10})`;
    ctx.beginPath(); ctx.ellipse(240 + r() * 320, 320 + r() * 90, 60 + r() * 90, 4 + r() * 6, 0, 0, Math.PI * 2); ctx.fill();
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
  // thin inner ring for a sharper edge
  ctx.strokeStyle = PALETTE.accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(128, 128, 88, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
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

// ---- v3 refinery theme: sandstone, corrugated steel, pipework, tanks, oil, signs ----

// Sandstone blockwork: warm tan ashlar courses with mortar joints, per-block
// tone variation, dust and a few dark stains — for the Pump Court walls.
export function sandstoneTexture() {
  const [c, ctx] = canvas(512, 512);
  const r = rng(113);
  ctx.fillStyle = PALETTE.sandstone;
  ctx.fillRect(0, 0, 512, 512);
  const rows = 8;
  const rh = 512 / rows;
  for (let row = 0; row < rows; row++) {
    const off = row % 2 ? 64 : 0;
    for (let x = -128; x < 512; x += 128) {
      const tone = r();
      ctx.fillStyle = tone < 0.33 ? 'rgba(255,230,190,0.10)' : tone < 0.66 ? 'rgba(120,84,44,0.10)' : 'rgba(90,60,30,0.08)';
      ctx.fillRect(x + off + 2, row * rh + 2, 124, rh - 4);
      // chipped corner on some blocks
      if (r() < 0.25) {
        ctx.fillStyle = 'rgba(70,48,26,0.25)';
        ctx.beginPath();
        ctx.moveTo(x + off + 2, row * rh + 2);
        ctx.lineTo(x + off + 18 + r() * 14, row * rh + 2);
        ctx.lineTo(x + off + 2, row * rh + 16 + r() * 12);
        ctx.closePath(); ctx.fill();
      }
    }
    // mortar joint
    ctx.fillStyle = 'rgba(74,54,32,0.55)';
    ctx.fillRect(0, row * rh - 1, 512, 3);
  }
  // vertical joints
  ctx.fillStyle = 'rgba(74,54,32,0.45)';
  for (let row = 0; row < rows; row++) {
    const off = row % 2 ? 64 : 0;
    for (let x = -128; x < 512; x += 128) ctx.fillRect(x + off - 1, row * rh, 3, rh);
  }
  // dust wash near the bottom, rust weep near the top
  const dust = ctx.createLinearGradient(0, 380, 0, 512);
  dust.addColorStop(0, 'rgba(120,90,50,0)');
  dust.addColorStop(1, 'rgba(120,90,50,0.25)');
  ctx.fillStyle = dust;
  ctx.fillRect(0, 380, 512, 132);
  ctx.fillStyle = PALETTE.containerRust;
  for (let i = 0; i < 8; i++) {
    ctx.globalAlpha = 0.12 + r() * 0.18;
    ctx.fillRect(r() * 512, 0, 3 + r() * 6, 30 + r() * 90);
  }
  ctx.globalAlpha = 1;
  speckles(ctx, r, 512, 512, 6000, [PALETTE.sandstoneDark, '#d8b37e', '#8a6a3f'], 1, 3);
  return finish(c);
}

// Corrugated steel: deep vertical ribs with a light crown and dark valley,
// sun-faded paint, rust creeping up from the bottom edge — for the sheds.
export function corrugatedTexture(base) {
  const [c, ctx] = canvas(512, 512);
  const r = rng(127);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 32) {
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x, 0, 8, 512);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x + 16, 0, 8, 512);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 28, 0, 4, 512);
  }
  // faded paint patches
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(240,225,190,0.08)' : 'rgba(20,16,10,0.08)';
    ctx.beginPath();
    ctx.ellipse(r() * 512, r() * 512, 40 + r() * 100, 24 + r() * 60, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // rust streaks running down from the top
  ctx.fillStyle = PALETTE.containerRust;
  for (let i = 0; i < 16; i++) {
    ctx.globalAlpha = 0.2 + r() * 0.3;
    ctx.fillRect(r() * 512, 0, 3 + r() * 7, 50 + r() * 200);
  }
  ctx.globalAlpha = 1;
  // rust band along the bottom edge
  const rustBand = ctx.createLinearGradient(0, 420, 0, 512);
  rustBand.addColorStop(0, 'rgba(122,74,40,0)');
  rustBand.addColorStop(1, 'rgba(122,74,40,0.55)');
  ctx.fillStyle = rustBand;
  ctx.fillRect(0, 420, 512, 92);
  // dents
  for (let i = 0; i < 6; i++) {
    const x = r() * 512, y = 60 + r() * 380;
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath(); ctx.ellipse(x, y, 12 + r() * 22, 7 + r() * 12, r() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
  speckles(ctx, r, 512, 512, 1000, ['rgba(0,0,0,0.35)', 'rgba(255,255,255,0.22)'], 1, 2);
  return finish(c);
}

// Rusted pipe steel: dark brown-grey with horizontal weld bands, rust blooms
// and oil sheen — for pipe racks, columns and the flare stack.
export function pipeTexture() {
  const [c, ctx] = canvas(512, 512);
  const r = rng(131);
  ctx.fillStyle = PALETTE.pipe;
  ctx.fillRect(0, 0, 512, 512);
  // horizontal brushed bands
  for (let y = 0; y < 512; y += 6) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.10)';
    ctx.fillRect(0, y, 512, 3);
  }
  // weld seams
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  for (const y of [128, 256, 384]) ctx.fillRect(0, y, 512, 4);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (const y of [132, 260, 388]) ctx.fillRect(0, y, 512, 2);
  // rust blooms along the seams
  ctx.fillStyle = PALETTE.rust;
  for (let i = 0; i < 30; i++) {
    const seamY = [128, 256, 384][(r() * 3) | 0] + (r() - 0.5) * 10;
    ctx.globalAlpha = 0.12 + r() * 0.22;
    ctx.beginPath();
    ctx.ellipse(r() * 512, seamY, 5 + r() * 14, 4 + r() * 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // oil sheen streaks
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = 'rgba(12,10,8,0.18)';
    ctx.globalAlpha = 0.5 + r() * 0.5;
    ctx.beginPath();
    ctx.ellipse(r() * 512, r() * 512, 14 + r() * 40, 8 + r() * 20, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  speckles(ctx, r, 512, 512, 1200, ['rgba(255,255,255,0.18)', 'rgba(0,0,0,0.3)'], 1, 2);
  return finish(c);
}

// Storage tank: horizontal strake bands with rivet rows, a hazard stripe near
// the top, rust weeping from the rim and the base.
export function tankTexture(base) {
  const [c, ctx] = canvas(512, 512);
  const r = rng(137);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  // horizontal strakes
  for (let y = 0; y < 512; y += 128) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, y, 512, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(0, y + 6, 512, 4);
    // rivets along each strake
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let x = 16; x < 512; x += 32) {
      ctx.beginPath(); ctx.arc(x, y + 22, 4, 0, Math.PI * 2); ctx.fill();
    }
  }
  // faded hazard stripe near the top
  ctx.save();
  ctx.globalAlpha = 0.85;
  for (let x = -64; x < 512; x += 64) {
    ctx.fillStyle = (x / 64) % 2 === 0 ? '#d8a028' : '#2a2118';
    ctx.beginPath();
    ctx.moveTo(x, 44); ctx.lineTo(x + 32, 44); ctx.lineTo(x + 64, 84); ctx.lineTo(x + 32, 84);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // sun-fade patches
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(240,225,190,0.07)' : 'rgba(20,16,10,0.08)';
    ctx.beginPath();
    ctx.ellipse(r() * 512, r() * 512, 50 + r() * 110, 30 + r() * 70, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // rust weeping from the top rim and pooling at the base
  ctx.fillStyle = PALETTE.rust;
  for (let i = 0; i < 14; i++) {
    ctx.globalAlpha = 0.18 + r() * 0.25;
    ctx.fillRect(r() * 512, 0, 4 + r() * 8, 30 + r() * 120);
  }
  for (let i = 0; i < 12; i++) {
    ctx.globalAlpha = 0.12 + r() * 0.18;
    ctx.beginPath();
    ctx.ellipse(r() * 512, 460 + r() * 52, 10 + r() * 24, 5 + r() * 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  speckles(ctx, r, 512, 512, 1000, ['rgba(0,0,0,0.3)', 'rgba(255,255,255,0.2)'], 1, 2);
  return finish(c);
}

// Oil stain decal: a dark iridescent blotch with a ragged edge, drawn once and
// laid flat on the sand near the refinery.
export function oilStainTexture() {
  const [c, ctx] = canvas(256, 256);
  const r = rng(149);
  ctx.clearRect(0, 0, 256, 256);
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 120);
  g.addColorStop(0, 'rgba(14,12,10,0.92)');
  g.addColorStop(0.55, 'rgba(20,16,12,0.75)');
  g.addColorStop(0.85, 'rgba(28,22,16,0.35)');
  g.addColorStop(1, 'rgba(28,22,16,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const rad = 100 + (r() - 0.5) * 36;
    const x = 128 + Math.cos(a) * rad;
    const y = 128 + Math.sin(a) * rad * 0.8;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fill();
  // faint rainbow sheen arcs
  ctx.strokeStyle = 'rgba(120,140,160,0.12)';
  ctx.lineWidth = 5;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(128, 128, 40 + i * 18 + r() * 8, r() * Math.PI, r() * Math.PI + 1.2 + r());
    ctx.stroke();
  }
  return finish(c);
}

// Unit-marking sign plate: dark steel plate, amber border, bold label + subline.
// Deterministic text drawing, no RNG involved.
export function plateTexture(text, sub) {
  const [c, ctx] = canvas(512, 256);
  ctx.fillStyle = '#2a2118';
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = PALETTE.accent;
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, 484, 228);
  ctx.strokeStyle = 'rgba(255,179,71,0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, 452, 196);
  ctx.fillStyle = PALETTE.accent;
  ctx.font = 'bold 64px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, sub ? 102 : 128);
  if (sub) {
    ctx.font = 'bold 34px Arial, sans-serif';
    ctx.fillStyle = '#d8c9a8';
    ctx.fillText(sub, 256, 178);
  }
  // rivets in the corners
  ctx.fillStyle = '#c9c2b2';
  for (const [x, y] of [[30, 30], [482, 30], [30, 226], [482, 226]]) {
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
  }
  return finish(c);
}
