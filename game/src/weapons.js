// Weapons v3: definitions, gradient-finish viewmodels, firing, reload and the
// grenade system (frag + smoke + flash). The numbers are the gunplay: stopping
// to aim pays, because spread and recoil grow with movement and with sustained
// fire. main.js owns the ray and the damage; this module owns the feel.
//
// GRADIENT FINISHES — every viewmodel part wears a canvas-texture linear
// gradient (see gradientTexture / FINISH below), so the fade is baked into the
// material and reads under the dusk light without any new dependency. Boxes
// fade along their length on the big side faces; long cylinders (barrels,
// scope tubes, suppressors) use a vertical gradient that runs along the tube.
// Each weapon has its own gradient identity so it reads at a glance:
//   P9 pistol   steel-grey -> black slide, dark polymer grip
//   VK-47 rifle gunmetal -> black receiver/barrel, wood-tan furniture
//   Raptor-9    dark teal -> charcoal receiver + suppressor, red-dot lens
//   Longshot    matte black -> dark grey, amber scope glass
//   S12K        gunmetal -> black, desert-tan -> brown pump
//   DMR-14      olive -> charcoal receiver, tan stock accents
// No Math.random anywhere in this file: grenade arcs, smoke puffs and flash
// timing are all deterministic (fixed offsets / fixed-step physics).
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', kind: 'pistol', price: 0,
    damage: 34, headMult: 3, fireGap: 0.25, auto: false,
    mag: 12, reserve: 48, reloadTime: 1.4,
    spreadStill: 0.008, spreadMoving: 0.03, spreadBloom: 0.006,
    recoilPitch: 0.012, recoilYaw: 0.004, range: 40, kick: 0.04, pellets: 1,
  },
  rifle: {
    id: 'rifle', name: 'VK-47', kind: 'rifle', price: 2700,
    damage: 34, headMult: 4, fireGap: 0.11, auto: true,
    mag: 30, reserve: 90, reloadTime: 2.2,
    spreadStill: 0.004, spreadMoving: 0.028, spreadBloom: 0.0035,
    recoilPitch: 0.014, recoilYaw: 0.005, range: 60, kick: 0.055, pellets: 1,
  },
  smg: {
    id: 'smg', name: 'Raptor-9', kind: 'smg', price: 1500,
    damage: 26, headMult: 4, fireGap: 0.07, auto: true,
    mag: 32, reserve: 96, reloadTime: 1.8,
    spreadStill: 0.01, spreadMoving: 0.04, spreadBloom: 0.005,
    recoilPitch: 0.01, recoilYaw: 0.006, range: 35, kick: 0.04, pellets: 1,
  },
  sniper: {
    id: 'sniper', name: 'Longshot', kind: 'sniper', price: 4750,
    damage: 110, headMult: 2, fireGap: 1.2, auto: false,
    mag: 5, reserve: 15, reloadTime: 3.0,
    spreadStill: 0.001, spreadMoving: 0.05, spreadBloom: 0.002,
    recoilPitch: 0.05, recoilYaw: 0.01, range: 100, kick: 0.11, pellets: 1,
  },
  shotgun: {
    id: 'shotgun', name: 'S12K', kind: 'shotgun', price: 2400,
    damage: 18, headMult: 1.5, fireGap: 0.9, auto: false,
    mag: 5, reserve: 20, reloadTime: 2.8,
    spreadStill: 0.05, spreadMoving: 0.08, spreadBloom: 0.01,
    recoilPitch: 0.04, recoilYaw: 0.01, range: 25, kick: 0.12, pellets: 8,
  },
  dmr: {
    id: 'dmr', name: 'DMR-14', kind: 'dmr', price: 3800,
    damage: 55, headMult: 2.5, fireGap: 0.35, auto: false,
    mag: 10, reserve: 30, reloadTime: 2.4,
    spreadStill: 0.002, spreadMoving: 0.03, spreadBloom: 0.004,
    recoilPitch: 0.025, recoilYaw: 0.006, range: 90, kick: 0.08, pellets: 1,
  },
};
// NOTE: shotgun and DMR had no price in v2 (loot-only BR, no buy menu); the
// 2400 / 3800 above are new v3 prices slotted between rifle (2700) and
// sniper (4750) so a buy menu can price them. All other stats are v2 verbatim.

export const GRENADE_PRICE = 300; // frag
export const SMOKE_PRICE = 250;
export const FLASH_PRICE = 200;
export const ARMOR_PRICE = 650;
export const DEFUSEKIT_PRICE = 400;
export const GRENADE_TYPES = ['frag', 'smoke', 'flash'];

// Utility slots, for main.js key wiring and the HUD slot labels. Digit1/2/3
// are free in main.js; Digit4/5/6 are heals (bandage/medkit/drink) and KeyG
// stays a frag alias, so the 1/3/4/5 mapping from the brief is NOT used —
// slots 4/5 would collide with the heal keys. Frag keeps its KeyG alias.
export const UTILITY_SLOTS = [
  { key: 'Digit1', label: '1', type: 'frag', name: 'Frag Grenade', price: GRENADE_PRICE },
  { key: 'Digit2', label: '2', type: 'smoke', name: 'Smoke Grenade', price: SMOKE_PRICE },
  { key: 'Digit3', label: '3', type: 'flash', name: 'Flash Grenade', price: FLASH_PRICE },
];

const MUZZLE_TIME = 0.06;

// -- Gradient finishes -------------------------------------------------------
// A small canvas painted with a 2-stop linear gradient, used as the map of a
// MeshStandardMaterial. The material colour stays white so the gradient shows
// true; metalness/roughness give the metallic sheen under the dusk light.
// Horizontal gradients run along a box part's length (its big side faces map
// U along Z); vertical gradients run along a cylinder's length (V runs along
// the tube), which is why barrels / scope tubes / suppressors use `barrel`.
const _gradCache = new Map();
function gradientTexture(stops, vertical) {
  const key = stops.join('|') + (vertical ? '|v' : '|h');
  const hit = _gradCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = vertical ? 16 : 128;
  c.height = vertical ? 128 : 16;
  const g = c.getContext('2d');
  const grad = vertical
    ? g.createLinearGradient(0, 0, 0, 128)
    : g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, stops[0]);
  grad.addColorStop(1, stops[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _gradCache.set(key, tex);
  return tex;
}

function gradMat(spec) {
  const mat = new THREE.MeshStandardMaterial({
    map: gradientTexture(spec.stops, !!spec.vertical),
    metalness: spec.metal,
    roughness: spec.rough,
  });
  if (spec.emissive) {
    mat.emissive = new THREE.Color(spec.emissive);
    mat.emissiveIntensity = spec.emissiveIntensity || 0.5;
  }
  return mat;
}

// Per-weapon finish spec. Roles: body = receiver/frame, steel = bright metal
// (slides, top covers, magazines), barrel = long cylinders (vertical
// gradient), dark = small black hardware, polymer/tan/wood = furniture,
// accent = amber details, glass = lenses (emissive so scopes glow faintly).
const FINISH = {
  pistol: { // P9 — steel-grey -> black slide, dark polymer grip
    body: { stops: ['#454a51', '#14161a'], metal: 0.65, rough: 0.45 },
    steel: { stops: ['#bcc6d0', '#23272c'], metal: 0.88, rough: 0.28 },
    barrel: { stops: ['#9aa4ae', '#1a1d20'], metal: 0.88, rough: 0.3, vertical: true },
    dark: { stops: ['#2e3339', '#0e1013'], metal: 0.6, rough: 0.5 },
    polymer: { stops: ['#55483a', '#221c15'], metal: 0.05, rough: 0.9 },
    tan: { stops: ['#8a6a3f', '#5a3d1e'], metal: 0.05, rough: 0.8 },
    wood: { stops: ['#8a6a3f', '#5a3d1e'], metal: 0.05, rough: 0.75 },
    accent: { stops: ['#ffc95e', '#c77f0e'], metal: 0.4, rough: 0.35 },
    glass: { stops: ['#2a4d66', '#0d1b26'], metal: 0.95, rough: 0.08 },
  },
  rifle: { // VK-47 — gunmetal -> black, wood-tan furniture
    body: { stops: ['#4d545e', '#14161a'], metal: 0.72, rough: 0.42 },
    steel: { stops: ['#707882', '#1e2126'], metal: 0.85, rough: 0.32 },
    barrel: { stops: ['#565e68', '#0f1113'], metal: 0.85, rough: 0.3, vertical: true },
    dark: { stops: ['#2c3036', '#0e1013'], metal: 0.6, rough: 0.5 },
    polymer: { stops: ['#453a2c', '#1d1710'], metal: 0.05, rough: 0.9 },
    tan: { stops: ['#a8824a', '#6b4423'], metal: 0.05, rough: 0.8 },
    wood: { stops: ['#9a743f', '#54371a'], metal: 0.05, rough: 0.75 },
    accent: { stops: ['#ffc95e', '#c77f0e'], metal: 0.4, rough: 0.35 },
    glass: { stops: ['#2a4d66', '#0d1b26'], metal: 0.95, rough: 0.08 },
  },
  smg: { // Raptor-9 — dark teal -> charcoal, red-dot lens
    body: { stops: ['#1e6f6a', '#22262b'], metal: 0.7, rough: 0.42 },
    steel: { stops: ['#4a7a76', '#1a1d20'], metal: 0.85, rough: 0.32 },
    barrel: { stops: ['#2e6f6a', '#0f1113'], metal: 0.8, rough: 0.35, vertical: true },
    dark: { stops: ['#1c2a28', '#0e1013'], metal: 0.6, rough: 0.5 },
    polymer: { stops: ['#1d4a46', '#12181a'], metal: 0.05, rough: 0.9 },
    tan: { stops: ['#8a6a3f', '#5a3d1e'], metal: 0.05, rough: 0.8 },
    wood: { stops: ['#6b4a26', '#3a2812'], metal: 0.05, rough: 0.75 },
    accent: { stops: ['#ffc95e', '#c77f0e'], metal: 0.4, rough: 0.35 },
    glass: { stops: ['#ff6a5a', '#7a0f08'], metal: 0.9, rough: 0.1, emissive: '#ff2a1a', emissiveIntensity: 0.7 },
  },
  sniper: { // Longshot — matte black -> dark grey, amber scope glass
    body: { stops: ['#232629', '#484d54'], metal: 0.6, rough: 0.5 },
    steel: { stops: ['#3a3e44', '#17191c'], metal: 0.85, rough: 0.35 },
    barrel: { stops: ['#1c1e22', '#4b5058'], metal: 0.8, rough: 0.38, vertical: true },
    dark: { stops: ['#26292e', '#0c0e10'], metal: 0.55, rough: 0.55 },
    polymer: { stops: ['#33302b', '#141210'], metal: 0.05, rough: 0.9 },
    tan: { stops: ['#a8895a', '#6b4f2a'], metal: 0.05, rough: 0.8 },
    wood: { stops: ['#6b4a26', '#3a2812'], metal: 0.05, rough: 0.75 },
    accent: { stops: ['#ffc95e', '#c77f0e'], metal: 0.4, rough: 0.35 },
    glass: { stops: ['#f7c95c', '#8a5a10'], metal: 0.9, rough: 0.1, emissive: '#f0a830', emissiveIntensity: 0.55 },
  },
  shotgun: { // S12K — gunmetal -> black, desert-tan -> brown pump
    body: { stops: ['#565e68', '#15181c'], metal: 0.72, rough: 0.42 },
    steel: { stops: ['#707882', '#1e2126'], metal: 0.85, rough: 0.32 },
    barrel: { stops: ['#5a626c', '#121417'], metal: 0.85, rough: 0.3, vertical: true },
    dark: { stops: ['#2c3036', '#0e1013'], metal: 0.6, rough: 0.5 },
    polymer: { stops: ['#3b332a', '#1a1512'], metal: 0.05, rough: 0.9 },
    tan: { stops: ['#c2a06a', '#6e4f2a'], metal: 0.05, rough: 0.8 },
    wood: { stops: ['#9a743f', '#4a3018'], metal: 0.05, rough: 0.75 },
    accent: { stops: ['#ffc95e', '#c77f0e'], metal: 0.4, rough: 0.35 },
    glass: { stops: ['#2a4d66', '#0d1b26'], metal: 0.95, rough: 0.08 },
  },
  dmr: { // DMR-14 — olive -> charcoal, tan stock
    body: { stops: ['#6b7040', '#23262b'], metal: 0.7, rough: 0.45 },
    steel: { stops: ['#7a7f55', '#1e2126'], metal: 0.85, rough: 0.32 },
    barrel: { stops: ['#4a5058', '#101214'], metal: 0.85, rough: 0.3, vertical: true },
    dark: { stops: ['#2c3036', '#0e1013'], metal: 0.6, rough: 0.5 },
    polymer: { stops: ['#4a4d33', '#1a1c12'], metal: 0.05, rough: 0.9 },
    tan: { stops: ['#a8895a', '#6b4f2a'], metal: 0.05, rough: 0.8 },
    wood: { stops: ['#8a6a3f', '#5a3d1e'], metal: 0.05, rough: 0.75 },
    accent: { stops: ['#ffc95e', '#c77f0e'], metal: 0.4, rough: 0.35 },
    glass: { stops: ['#c98a3a', '#4a2f08'], metal: 0.9, rough: 0.1, emissive: '#f0a830', emissiveIntensity: 0.4 },
  },
};

function materialsFor(kind) {
  const spec = FINISH[kind] || FINISH.rifle;
  const M = {};
  for (const role of Object.keys(spec)) M[role] = gradMat(spec[role]);
  return M;
}

// HD first-person viewmodels: each weapon is built from 16-24 distinct parts
// (receiver, barrel, magazine, stock, grip, handguard, muzzle, sight/scope)
// in its own gradient finish, so the silhouette reads clearly at 1280x720.
// Forward is -Z; the muzzle tip sits near local z -0.5 so it meets the flash
// at world z -0.85. Geometry is the v2 layout (proven framing), re-skinned
// with gradient materials; long cylinders use M.barrel (vertical gradient).
function buildViewModel(kind) {
  const M = materialsFor(kind);
  const model = new THREE.Group();
  function part(w, h, d, x, y, z, mat, rx = 0, rz = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || M.body);
    mesh.position.set(x, y, z);
    if (rx) mesh.rotation.x = rx;
    if (rz) mesh.rotation.z = rz;
    model.add(mesh);
    return mesh;
  }
  // Cylinder along z (barrels, scope tubes, suppressors), x, or y (turrets).
  function tube(r, len, x, y, z, mat, axis = 'z') {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 20), mat || M.steel);
    if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    else if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    mesh.position.set(x, y, z);
    model.add(mesh);
    return mesh;
  }
  function knob(r, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat || M.dark);
    mesh.position.set(x, y, z);
    model.add(mesh);
    return mesh;
  }
  if (kind === 'pistol') {
    // P9 Sidearm — compact slide pistol. 16 parts, gradient steel slide.
    part(0.055, 0.045, 0.26, 0, 0.045, -0.06, M.steel);          // slide
    part(0.058, 0.02, 0.03, 0, 0.05, 0.03, M.dark);              // slide serration band
    part(0.058, 0.02, 0.03, 0, 0.05, 0.06, M.dark);              // slide serration band
    part(0.05, 0.06, 0.22, 0, -0.005, -0.04, M.body);            // frame
    tube(0.016, 0.03, 0, 0.045, -0.2, M.barrel);                  // barrel tip
    tube(0.02, 0.012, 0, 0.045, -0.205, M.steel);                 // muzzle ring
    part(0.008, 0.02, 0.008, 0, 0.078, -0.17, M.accent);          // front sight (amber)
    part(0.03, 0.015, 0.012, 0, 0.075, 0.05, M.dark);             // rear sight
    part(0.056, 0.015, 0.05, 0, 0.055, -0.1, M.dark);             // ejection port inset
    part(0.05, 0.13, 0.06, 0, -0.09, 0.045, M.polymer, 0.18);     // grip, raked back
    part(0.055, 0.015, 0.065, 0, -0.155, 0.055, M.dark);          // magazine base plate
    part(0.008, 0.03, 0.012, 0, -0.045, -0.075, M.dark);          // trigger
    part(0.008, 0.008, 0.07, 0, -0.062, -0.055, M.dark);          // trigger guard bar
    part(0.012, 0.025, 0.015, 0, 0.06, 0.06, M.dark);             // hammer
    part(0.052, 0.012, 0.2, 0, -0.038, -0.04, M.dark);            // accessory rail under frame
    knob(0.01, 0.028, -0.02, 0.03, M.accent);                     // magazine release button
  } else if (kind === 'smg') {
    // Raptor-9 — short boxy SMG, teal -> charcoal, suppressor shroud, red dot. 22 parts.
    part(0.08, 0.09, 0.26, 0, 0, 0, M.body);                     // receiver
    part(0.05, 0.012, 0.24, 0, 0.052, 0, M.dark);                // top rail
    part(0.052, 0.014, 0.012, 0, 0.052, -0.08, M.steel);         // rail slot
    part(0.052, 0.014, 0.012, 0, 0.052, 0, M.steel);             // rail slot
    part(0.052, 0.014, 0.012, 0, 0.052, 0.08, M.steel);          // rail slot
    tube(0.03, 0.22, 0, 0.01, -0.24, M.barrel);                   // suppressor shroud
    tube(0.032, 0.01, 0, 0.01, -0.18, M.steel);                  // suppressor ring
    tube(0.032, 0.01, 0, 0.01, -0.3, M.steel);                   // suppressor ring
    part(0.035, 0.035, 0.05, 0, 0.08, -0.02, M.dark);             // red-dot housing
    part(0.025, 0.025, 0.005, 0, 0.08, -0.048, M.glass);          // red-dot lens
    part(0.035, 0.09, 0.04, 0, -0.09, -0.16, M.polymer);          // vertical foregrip
    part(0.045, 0.18, 0.07, 0, -0.13, -0.02, M.steel, 0.08);      // long straight magazine
    part(0.05, 0.015, 0.075, 0, -0.215, -0.005, M.dark);          // magazine base plate
    part(0.05, 0.1, 0.06, 0, -0.09, 0.09, M.polymer, 0.2);        // pistol grip
    tube(0.008, 0.12, -0.02, 0, 0.19, M.steel);                   // stock bar
    tube(0.008, 0.12, 0.02, 0, 0.19, M.steel);                    // stock bar
    part(0.06, 0.1, 0.02, 0, 0, 0.26, M.polymer);                 // butt plate
    part(0.008, 0.025, 0.01, 0, -0.05, 0, M.dark);                // trigger
    part(0.025, 0.012, 0.02, -0.045, 0.01, -0.06, M.steel);       // charging handle
    part(0.052, 0.02, 0.06, 0.041, 0.01, -0.02, M.dark);          // ejection port
    part(0.01, 0.018, 0.04, 0.042, 0, 0.06, M.accent);            // safety selector
    knob(0.01, 0.045, -0.05, -0.02, M.dark);                      // magazine release
  } else if (kind === 'sniper') {
    // Longshot — long bolt-action with big scope and bipod. 23 parts.
    part(0.08, 0.09, 0.34, 0, 0, -0.06, M.body);                 // receiver
    tube(0.02, 0.34, 0, 0.015, -0.4, M.barrel);                   // long barrel
    tube(0.035, 0.07, 0, 0.015, -0.56, M.barrel);                 // muzzle brake
    part(0.075, 0.012, 0.03, 0, 0.015, -0.545, M.steel);          // brake port
    part(0.075, 0.012, 0.03, 0, 0.015, -0.575, M.steel);          // brake port
    tube(0.028, 0.24, 0, 0.085, -0.1, M.barrel);                  // scope tube
    tube(0.04, 0.05, 0, 0.085, -0.23, M.dark);                    // objective bell
    tube(0.034, 0.006, 0, 0.085, -0.256, M.glass);                // objective lens
    tube(0.034, 0.04, 0, 0.085, 0.015, M.dark);                   // ocular bell
    tube(0.014, 0.03, 0, 0.125, -0.1, M.steel, 'y');              // elevation turret
    tube(0.014, 0.025, 0.032, 0.085, -0.1, M.steel, 'x');         // windage turret
    part(0.03, 0.025, 0.02, 0, 0.055, -0.18, M.steel);            // scope mount
    part(0.03, 0.025, 0.02, 0, 0.055, -0.02, M.steel);            // scope mount
    part(0.065, 0.09, 0.18, 0, -0.01, 0.2, M.polymer);            // stock
    part(0.06, 0.03, 0.14, 0, 0.05, 0.18, M.tan);                 // cheek riser
    part(0.07, 0.1, 0.02, 0, -0.01, 0.295, M.dark);               // butt pad
    part(0.05, 0.11, 0.06, 0, -0.09, 0.08, M.polymer, 0.25);      // pistol grip
    part(0.05, 0.1, 0.1, 0, -0.09, -0.08, M.steel, 0.05);         // magazine
    tube(0.008, 0.06, 0.055, 0.01, -0.02, M.steel, 'x');          // bolt handle
    knob(0.014, 0.088, 0.01, -0.02, M.dark);                      // bolt knob
    part(0.012, 0.16, 0.012, -0.035, -0.07, -0.3, M.steel, 0, 0.35);  // bipod leg
    part(0.012, 0.16, 0.012, 0.035, -0.07, -0.3, M.steel, 0, -0.35); // bipod leg
    part(0.008, 0.025, 0.01, 0, -0.05, -0.02, M.dark);            // trigger
  } else if (kind === 'shotgun') {
    // S12K — wide pump shotgun with box magazine, ghost-ring sight, side
    // saddle shells. 22 parts, desert-tan pump fading to brown.
    part(0.09, 0.1, 0.3, 0, 0, 0, M.body);                       // wide receiver
    tube(0.024, 0.3, 0, 0.03, -0.3, M.barrel);                    // thick barrel
    tube(0.02, 0.26, 0, -0.035, -0.28, M.barrel);                 // magazine tube
    part(0.095, 0.08, 0.18, 0, -0.01, -0.26, M.tan);              // pump forend
    part(0.097, 0.012, 0.015, 0, -0.01, -0.2, M.dark);            // pump groove
    part(0.097, 0.012, 0.015, 0, -0.01, -0.26, M.dark);           // pump groove
    part(0.097, 0.012, 0.015, 0, -0.01, -0.32, M.dark);           // pump groove
    tube(0.03, 0.02, 0, 0.03, -0.45, M.dark);                     // muzzle ring
    part(0.05, 0.012, 0.26, 0, 0.056, -0.02, M.dark);             // top rail
    knob(0.008, 0, 0.075, -0.42, M.accent);                       // front bead sight
    tube(0.018, 0.01, 0, 0.07, -0.02, M.dark);                    // ghost-ring rear sight
    part(0.06, 0.14, 0.11, 0, -0.11, -0.03, M.steel, 0.06);       // box magazine
    part(0.065, 0.015, 0.115, 0, -0.18, -0.02, M.dark);           // magazine base plate
    part(0.065, 0.085, 0.17, 0, -0.005, 0.21, M.wood);            // stock
    part(0.07, 0.095, 0.02, 0, -0.005, 0.3, M.polymer);           // butt pad
    part(0.05, 0.11, 0.06, 0, -0.09, 0.1, M.polymer, 0.25);       // pistol grip
    part(0.008, 0.025, 0.01, 0, -0.05, -0.02, M.dark);            // trigger
    part(0.03, 0.012, 0.02, 0.05, 0.01, -0.1, M.steel);           // charging handle
    part(0.092, 0.03, 0.08, 0, 0.02, -0.05, M.dark);              // ejection port inset
    tube(0.011, 0.05, -0.048, 0.02, 0.0, M.accent);               // side-saddle shell 1
    tube(0.011, 0.05, -0.048, 0.02, 0.055, M.accent);             // side-saddle shell 2
    tube(0.011, 0.05, -0.048, 0.02, 0.11, M.accent);              // side-saddle shell 3
  } else if (kind === 'dmr') {
    // DMR-14 — scoped marksman rifle, olive -> charcoal, tan stock. 24 parts.
    part(0.075, 0.085, 0.36, 0, 0, -0.04, M.body);                // receiver
    tube(0.019, 0.32, 0, 0.012, -0.38, M.barrel);                 // barrel
    tube(0.03, 0.06, 0, 0.012, -0.54, M.barrel);                  // muzzle brake
    part(0.07, 0.07, 0.24, 0, 0, -0.28, M.polymer);               // handguard
    part(0.072, 0.008, 0.014, 0, 0.038, -0.2, M.steel);           // handguard rail slot
    part(0.072, 0.008, 0.014, 0, 0.038, -0.28, M.steel);          // handguard rail slot
    part(0.072, 0.008, 0.014, 0, 0.038, -0.36, M.steel);          // handguard rail slot
    tube(0.026, 0.22, 0, 0.08, -0.08, M.barrel);                  // scope tube
    tube(0.037, 0.045, 0, 0.08, -0.2, M.dark);                    // objective bell
    tube(0.031, 0.006, 0, 0.08, -0.224, M.glass);                 // objective lens
    tube(0.032, 0.035, 0, 0.08, 0.03, M.dark);                    // ocular bell
    tube(0.013, 0.028, 0, 0.117, -0.08, M.steel, 'y');            // elevation turret
    part(0.028, 0.022, 0.018, 0, 0.05, -0.16, M.steel);           // scope mount
    part(0.028, 0.022, 0.018, 0, 0.05, 0, M.steel);               // scope mount
    part(0.06, 0.08, 0.18, 0, -0.005, 0.22, M.tan);               // stock
    part(0.055, 0.025, 0.12, 0, 0.045, 0.2, M.polymer);           // cheek riser
    part(0.065, 0.09, 0.02, 0, -0.005, 0.315, M.dark);            // butt pad
    part(0.05, 0.11, 0.06, 0, -0.09, 0.1, M.polymer, 0.25);       // pistol grip
    part(0.045, 0.16, 0.08, 0, -0.12, -0.05, M.steel, 0.06);      // magazine
    part(0.05, 0.015, 0.085, 0, -0.195, -0.04, M.dark);           // magazine base plate
    part(0.012, 0.15, 0.012, -0.035, -0.065, -0.34, M.steel, 0, 0.3);  // bipod leg
    part(0.012, 0.15, 0.012, 0.035, -0.065, -0.34, M.steel, 0, -0.3); // bipod leg
    part(0.03, 0.012, 0.02, 0.042, 0.01, -0.06, M.steel);         // charging handle
    part(0.008, 0.025, 0.01, 0, -0.05, -0.02, M.dark);            // trigger
  } else {
    // VK-47 — wood-furnished rifle with curved magazine. 23 parts.
    part(0.075, 0.085, 0.3, 0, 0, -0.02, M.body);                 // receiver
    part(0.06, 0.02, 0.28, 0, 0.052, -0.02, M.steel);             // top cover
    tube(0.018, 0.3, 0, 0.01, -0.32, M.barrel);                   // barrel
    tube(0.028, 0.06, 0, 0.01, -0.48, M.barrel);                  // muzzle brake
    tube(0.03, 0.01, 0, 0.01, -0.45, M.accent);                   // muzzle accent ring
    part(0.07, 0.075, 0.2, 0, -0.005, -0.26, M.wood);             // wooden handguard
    part(0.072, 0.008, 0.18, 0, 0.035, -0.26, M.dark);            // handguard vent strip
    tube(0.012, 0.18, 0, 0.055, -0.24, M.steel);                  // gas tube
    part(0.008, 0.035, 0.008, 0, 0.075, -0.38, M.dark);           // front sight post
    part(0.03, 0.02, 0.01, 0, 0.06, -0.38, M.dark);               // front sight ears
    part(0.025, 0.02, 0.03, 0, 0.065, -0.06, M.dark);             // rear sight
    part(0.05, 0.12, 0.09, 0, -0.1, -0.02, M.steel, 0.15);        // curved magazine (upper)
    part(0.05, 0.1, 0.09, 0, -0.19, 0.01, M.steel, 0.35);         // curved magazine (lower)
    part(0.055, 0.015, 0.095, 0, -0.235, 0.03, M.dark);           // magazine base plate
    part(0.05, 0.11, 0.06, 0, -0.09, 0.1, M.polymer, 0.25);       // pistol grip
    part(0.06, 0.08, 0.16, 0, -0.005, 0.2, M.wood);               // wooden stock
    part(0.065, 0.09, 0.02, 0, -0.005, 0.285, M.polymer);         // butt pad
    part(0.008, 0.025, 0.01, 0, -0.05, -0.02, M.dark);            // trigger
    part(0.03, 0.012, 0.02, 0.045, 0.01, -0.08, M.steel);         // charging handle
    part(0.078, 0.012, 0.2, 0, 0.02, -0.02, M.dark);              // side plate detail
    part(0.01, 0.02, 0.05, 0.042, 0.02, 0.06, M.accent);          // safety selector lever
    part(0.012, 0.03, 0.02, 0.04, -0.03, -0.02, M.dark);          // magazine release
    tube(0.006, 0.05, 0, -0.045, 0.24, M.dark, 'x');              // rear sling loop
  }
  model.position.set(0.32, -0.3, -0.6);
  model.scale.setScalar(0.5);
  return model;
}

export function createWeaponRig(camera, audio) {
  const models = {};
  for (const kind of ['pistol', 'rifle', 'smg', 'sniper', 'shotgun', 'dmr']) {
    const model = buildViewModel(kind);
    model.visible = false;
    camera.add(model);
    models[kind] = model;
  }
  const flashTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255, 240, 180, 1)');
    grad.addColorStop(0.35, 'rgba(240, 168, 48, 0.9)');
    grad.addColorStop(1, 'rgba(240, 168, 48, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  flash.position.set(0.32, -0.28, -0.85);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.3, -0.23, -0.6);
  camera.add(flashLight);

  let current = null;
  let state = null;
  let bloom = 0;

  function equip(def) {
    if (current) models[current.kind].visible = false;
    current = def;
    state = { mag: def.mag, reserve: def.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0 };
    models[def.kind].visible = true;
    bloom = 0;
  }

  function step(dt) {
    if (!state) return;
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    bloom = Math.max(0, bloom - dt * 0.02);
    const model = models[current.kind];
    model.position.z = -0.6 + state.kick;
    model.rotation.x = state.kick * 2.2;
    model.position.y = -0.3 + (state.reloadLeft > 0 ? Math.sin((current.reloadTime - state.reloadLeft) * 4) * 0.03 : 0);
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (current.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = current.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    get def() { return current; },
    get state() { return state; },
    equip,
    step,
    ready() {
      return !!state && state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    canFire() {
      return !!state && state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = current.fireGap;
      state.flash = MUZZLE_TIME;
      state.kick = current.kick;
      bloom = Math.min(0.03, bloom + current.spreadBloom);
      audio.shoot(current.kind);
    },
    takeRound() {
      if (!state || state.mag <= 0) { audio.dryFire(); return false; }
      state.mag -= 1;
      return true;
    },
    reload() {
      if (!state || state.reloadLeft > 0 || state.mag === current.mag || state.reserve === 0) return false;
      state.reloadLeft = current.reloadTime;
      audio.reload();
      return true;
    },
    spread(speed) {
      const move = Math.min(1, speed / 5.2);
      return current.spreadStill + move * current.spreadMoving + bloom;
    },
    refillAmmo() {
      if (!state) return;
      state.mag = current.mag;
      state.reserve = current.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      bloom = 0;
    },
    addReserve(amount) {
      if (state) state.reserve += amount;
    },
  };
}


// -- Grenades: frag + smoke + flash ------------------------------------------
// One manager, up to 4 grenades in flight at once. The v2 API is preserved:
//   createGrenade(scene, colliders) -> { active, position, throwFrom, step }
//   throwFrom(origin, direction) throws a frag; step(dt) returns true only
//   when a FRAG detonates, so main.js's `if (grenade.step(dt)) explodeGrenade()`
//   keeps working unchanged (explodeGrenade reads grenade.position, the last
//   detonated frag's position). Smoke/flash detonations are handled inside
//   step() and reported via takeEvents(), which main.js should drain each
//   frame for sounds / HUD (see the integration notes at the bottom).
//
//   throwFrom(origin, direction, type) — type 'frag' | 'smoke' | 'flash',
//     returns false when the flight pool is full or the type is unknown
//     (caller should refund the inventory in that case).
//   smokeClouds            — [{ position, radius, strength }] (live clouds)
//   smokeBlocksLOS(a, b)   — true when the segment a->b passes through smoke
//     (bots.js: also require this in visibleEnemy, alongside lineOfSight).
//   flashLevelAt(pos, forward, lineOfSight?) — 0..1 blindness for an observer
//     at pos facing `forward` (bots: skip firing while > 0.5, wreck accuracy
//     while > 0.15; player: HUD white overlay opacity). Facing away, beyond
//     ~20 m, or behind cover (lineOfSight fails) all give 0.
//   flashEffect            — facing/distance-agnostic peak flash 0..1, for a
//     HUD fallback; prefer flashLevelAt (facing-aware) when the camera
//     direction is available.
//   takeEvents()           — drains [{ type, position }] detonations this frame.
//   setLineOfSight(fn)     — lets flashLevelAt use the game's LOS without the
//     caller passing it every time (main.js defines lineOfSight after the
//     grenade is created, so a setter is the reliable route).
//   reset()                — clear flights, clouds and flashes (match restart).
const FRAG_FUSE = 1.4;
const FRAG_RADIUS = 6; // kept for main.js explodeGrenade's reference; damage lives there
const SMOKE_DURATION = 15;
const SMOKE_RADIUS_START = 1.6;
const SMOKE_RADIUS_MAX = 4.6;
const FLASH_RANGE = 20;
const FLASH_DURATION = 3;
const MAX_FLIGHT = 4;
const MAX_CLOUDS = 3;
const SMOKE_PUFFS = 9;

// Deterministic smoke-puff layout: golden-angle disc, staggered heights.
// No RNG — the same detonation always builds the same cloud.
const PUFF_OFFSETS = (() => {
  const out = [];
  for (let i = 0; i < SMOKE_PUFFS; i += 1) {
    const a = i * 2.39996; // golden angle
    const r = 0.55 * Math.sqrt((i + 0.5) / SMOKE_PUFFS);
    const y = -0.1 + 0.35 * (i % 3) + 0.15 * (i % 2);
    out.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  return out;
})();

function softCircleTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _fv = new THREE.Vector3();
const _fw = new THREE.Vector3();

export function createGrenade(scene, colliders, hooks) {
  const smokeTex = softCircleTexture('rgba(255,255,255,0.85)', 'rgba(255,255,255,0)');
  const flashTex = softCircleTexture('rgba(255,250,230,1)', 'rgba(255,240,200,0)');
  const flightMats = {
    frag: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.metal), roughness: 0.4, metalness: 0.6 }),
    smoke: new THREE.MeshStandardMaterial({ color: new THREE.Color('#6b7040'), roughness: 0.6, metalness: 0.3 }),
    flash: new THREE.MeshStandardMaterial({ color: new THREE.Color('#c8ccd2'), roughness: 0.25, metalness: 0.9 }),
  };
  const flightGeo = new THREE.SphereGeometry(0.09, 12, 10);
  const flights = [];
  for (let i = 0; i < MAX_FLIGHT; i += 1) {
    const mesh = new THREE.Mesh(flightGeo, flightMats.frag);
    mesh.visible = false;
    scene.add(mesh);
    flights.push({
      mesh, inUse: false, type: 'frag',
      pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      fuse: 0, bounced: false,
    });
  }
  // One reusable flash visual (bright sprite + light), retriggered per bang.
  const flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flashTex, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  flashSprite.scale.setScalar(6);
  flashSprite.visible = false;
  scene.add(flashSprite);
  const flashLight = new THREE.PointLight(0xfff2cc, 0, 25);
  scene.add(flashLight);
  let flashVisAge = Infinity;

  const clouds = [];
  const flashEvents = [];
  const pending = [];
  const lastFragPos = new THREE.Vector3(0, -10, 0);
  let losFn = (hooks && hooks.lineOfSight) || null;

  function spawnCloud(center) {
    if (clouds.length >= MAX_CLOUDS) removeCloud(clouds[0]);
    const puffs = [];
    for (let i = 0; i < SMOKE_PUFFS; i += 1) {
      const mat = new THREE.SpriteMaterial({
        map: smokeTex, color: new THREE.Color('#8f8f8c'),
        transparent: true, opacity: 0, depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(center);
      scene.add(sprite);
      puffs.push({ sprite, base: 2.2 + 0.3 * (i % 4), op: 0.8 + 0.2 * (((i * 37) % 10) / 10) });
    }
    clouds.push({ center: center.clone(), age: 0, radius: SMOKE_RADIUS_START, strength: 1, puffs });
  }

  function removeCloud(cloud) {
    for (const p of cloud.puffs) {
      scene.remove(p.sprite);
      p.sprite.material.dispose();
    }
    clouds.splice(clouds.indexOf(cloud), 1);
  }

  function updateCloud(cloud, dt) {
    cloud.age += dt;
    cloud.radius = SMOKE_RADIUS_START
      + (SMOKE_RADIUS_MAX - SMOKE_RADIUS_START) * Math.min(1, cloud.age / 3);
    cloud.strength = cloud.age < 11 ? 1 : Math.max(0, 1 - (cloud.age - 11) / 4);
    const spread = cloud.radius / SMOKE_RADIUS_START;
    const grow = 0.65 + 0.5 * Math.min(1, cloud.age / 3);
    for (let i = 0; i < cloud.puffs.length; i += 1) {
      const p = cloud.puffs[i];
      const off = PUFF_OFFSETS[i];
      p.sprite.position.set(
        cloud.center.x + off.x * spread,
        Math.max(0.4, cloud.center.y + off.y * spread),
        cloud.center.z + off.z * spread,
      );
      p.sprite.scale.setScalar(p.base * grow);
      p.sprite.material.opacity = 0.3 * cloud.strength * p.op;
    }
  }

  function detonate(flight) {
    const pos = flight.pos.clone();
    pending.push({ type: flight.type, position: pos });
    if (flight.type === 'frag') {
      lastFragPos.copy(flight.pos);
    } else if (flight.type === 'smoke') {
      spawnCloud(flight.pos);
    } else if (flight.type === 'flash') {
      flashEvents.push({ position: flight.pos.clone(), age: 0 });
      flashSprite.position.copy(flight.pos);
      flashSprite.visible = true;
      flashLight.position.copy(flight.pos);
      flashVisAge = 0;
    }
    flight.inUse = false;
    flight.mesh.visible = false;
  }

  return {
    get active() { return flights.some((f) => f.inUse); },
    // Position of the most recently detonated frag (v2 semantics, for
    // main.js explodeGrenade); tracks an in-flight frag while one flies.
    get position() { return lastFragPos; },
    get smokeClouds() {
      return clouds.map((c) => ({ position: c.center, radius: c.radius, strength: c.strength }));
    },
    // Facing/distance-agnostic peak flash, 0..1 — HUD fallback only.
    get flashEffect() {
      let best = 0;
      for (const e of flashEvents) best = Math.max(best, Math.max(0, 1 - e.age / FLASH_DURATION));
      return best;
    },
    setLineOfSight(fn) { losFn = fn || null; },
    throwFrom(origin, direction, type = 'frag') {
      if (!flightMats[type]) return false;
      const flight = flights.find((f) => !f.inUse);
      if (!flight) return false;
      flight.type = type;
      flight.pos.copy(origin);
      flight.vel.copy(direction).multiplyScalar(16);
      flight.vel.y += 4.5;
      flight.fuse = FRAG_FUSE;
      flight.bounced = false;
      flight.inUse = true;
      flight.mesh.material = flightMats[type];
      flight.mesh.visible = true;
      flight.mesh.position.copy(flight.pos);
      if (type === 'frag') lastFragPos.copy(origin);
      return true;
    },
    step(dt) {
      let fragDetonated = false;
      for (const flight of flights) {
        if (!flight.inUse) continue;
        flight.vel.y -= 14 * dt;
        const next = flight.pos.clone().addScaledVector(flight.vel, dt);
        if (next.y < 0.09) {
          next.y = 0.09;
          if (Math.abs(flight.vel.y) > 2 && !flight.bounced) {
            flight.vel.y = -flight.vel.y * 0.45; flight.vel.x *= 0.7; flight.vel.z *= 0.7; flight.bounced = true;
          } else { flight.vel.y = 0; flight.vel.x *= 0.8; flight.vel.z *= 0.8; }
        }
        for (const c of colliders) {
          if (next.x > c.min.x - 0.09 && next.x < c.max.x + 0.09 && next.y > c.min.y - 0.09 && next.y < c.max.y + 0.09 && next.z > c.min.z - 0.09 && next.z < c.max.z + 0.09) {
            flight.vel.x *= -0.4; flight.vel.z *= -0.4; flight.vel.y *= 0.4;
            next.copy(flight.pos);
            break;
          }
        }
        flight.pos.copy(next);
        flight.mesh.position.copy(flight.pos);
        flight.mesh.rotation.x += dt * 9;
        flight.mesh.rotation.z += dt * 6;
        if (flight.type === 'frag') lastFragPos.copy(flight.pos);
        flight.fuse -= dt;
        if (flight.fuse <= 0) {
          if (flight.type === 'frag') fragDetonated = true;
          detonate(flight);
        }
      }
      for (let i = clouds.length - 1; i >= 0; i -= 1) {
        updateCloud(clouds[i], dt);
        if (clouds[i].age >= SMOKE_DURATION) removeCloud(clouds[i]);
      }
      for (let i = flashEvents.length - 1; i >= 0; i -= 1) {
        flashEvents[i].age += dt;
        if (flashEvents[i].age >= FLASH_DURATION) flashEvents.splice(i, 1);
      }
      if (flashVisAge < 0.35) {
        flashVisAge += dt;
        const k = Math.max(0, 1 - flashVisAge / 0.35);
        flashSprite.material.opacity = k;
        flashLight.intensity = 30 * k;
        if (k === 0) flashSprite.visible = false;
      } else {
        flashSprite.visible = false;
        flashLight.intensity = 0;
      }
      return fragDetonated;
    },
    // True when the segment a->b passes through a live smoke cloud. Segment
    // vs sphere: closest point on the segment to the cloud centre must be
    // inside the cloud's effective radius (and the cloud must be opaque
    // enough to matter, strength > 0.25).
    smokeBlocksLOS(a, b) {
      for (const cloud of clouds) {
        if (cloud.strength < 0.25) continue;
        _ab.subVectors(b, a);
        const lenSq = _ab.lengthSq();
        if (lenSq === 0) continue;
        _ac.subVectors(cloud.center, a);
        const t = Math.max(0, Math.min(1, _ac.dot(_ab) / lenSq));
        _closest.copy(a).addScaledVector(_ab, t);
        if (_closest.distanceTo(cloud.center) < cloud.radius * 0.9) return true;
      }
      return false;
    },
    // Blindness 0..1 for an observer at `pos` facing `forward` (normalised
    // internally). A flash blinds only when the observer looks roughly
    // toward it (dot > 0.05), is within FLASH_RANGE, and has line of sight
    // (pass the game's lineOfSight, or register it via setLineOfSight).
    // Point-blank (< 0.5 m) always blinds. Fades over FLASH_DURATION.
    flashLevelAt(pos, forward, lineOfSightFn) {
      const los = lineOfSightFn || losFn;
      _fw.copy(forward).normalize();
      let best = 0;
      for (const e of flashEvents) {
        const timeFactor = Math.max(0, 1 - e.age / FLASH_DURATION);
        if (timeFactor === 0) continue;
        _fv.subVectors(e.position, pos);
        const d = _fv.length();
        if (d > FLASH_RANGE) continue;
        if (d < 0.5) { best = Math.max(best, timeFactor); continue; }
        _fv.normalize();
        const facing = _fw.dot(_fv);
        if (facing < 0.05) continue;
        if (los && !los(pos, e.position)) continue;
        const strength = (1 - d / FLASH_RANGE) * timeFactor * (0.4 + 0.6 * facing);
        best = Math.max(best, strength);
      }
      return best;
    },
    takeEvents() {
      return pending.splice(0, pending.length);
    },
    reset() {
      for (const flight of flights) {
        flight.inUse = false;
        flight.mesh.visible = false;
      }
      for (let i = clouds.length - 1; i >= 0; i -= 1) removeCloud(clouds[i]);
      flashEvents.length = 0;
      pending.length = 0;
      flashSprite.visible = false;
      flashLight.intensity = 0;
      flashVisAge = Infinity;
      lastFragPos.set(0, -10, 0);
    },
  };
}

// -- Integration notes for the main.js / bots.js / hud.js workers ------------
// main.js: keep `if (grenade.active && grenade.step(dt)) explodeGrenade()` —
//   it still fires only for frags. Each frame also drain
//   `grenade.takeEvents()` for smoke/flash detonations (play a hiss/pop,
//   killfeed note). Wire the keys: Digit1 -> throwGrenade('frag'),
//   Digit2 -> throwGrenade('smoke'), Digit3 -> throwGrenade('flash'),
//   KeyG stays a frag alias; heals stay Digit4/5/6. Call
//   `grenade.setLineOfSight(lineOfSight)` once at startup. Track three
//   inventory counts (frag/smoke/flash) and refund when throwFrom returns
//   false (pool full). Player flash: each frame,
//   `hud.setFlash(grenade.flashLevelAt(camera.position, cameraDir))` where
//   cameraDir is the camera forward vector.
// bots.js: in visibleEnemy, after the lineOfSight check, add
//   `if (ctx.smokeBlocksLOS && ctx.smokeBlocksLOS(botEye(bot), enemy.eyePos())) continue;`
//   and expose smokeBlocksLOS + flashLevelAt on botCtx from main.js. In the
//   firing branch, `const blind = ctx.flashLevelAt(eye, forward)`; skip the
//   burst while blind > 0.5 and multiply aim error by (1 + blind * 4) while
//   blind > 0.15. Frag damage stays in main.js explodeGrenade (6 m, LOS).
// loot.js: a grenade pickup can grant a random type; the frag pickup mesh is
//   unchanged. FRAG_RADIUS (6 m) is exported above only as documentation —
//   the 120-damage falloff still lives in main.js.
export { FRAG_RADIUS };
