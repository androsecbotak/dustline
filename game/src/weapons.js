// Weapons: definitions, view models, firing, reload and the grenade. The numbers are the
// gunplay: stopping to aim pays, because spread and recoil grow with movement and with
// sustained fire. main.js owns the ray and the damage; this module owns the feel.
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
    id: 'shotgun', name: 'S12K', kind: 'shotgun',
    damage: 18, headMult: 1.5, fireGap: 0.9, auto: false,
    mag: 5, reserve: 20, reloadTime: 2.8,
    spreadStill: 0.05, spreadMoving: 0.08, spreadBloom: 0.01,
    recoilPitch: 0.04, recoilYaw: 0.01, range: 25, kick: 0.12, pellets: 8,
  },
  dmr: {
    id: 'dmr', name: 'DMR-14', kind: 'dmr',
    damage: 55, headMult: 2.5, fireGap: 0.35, auto: false,
    mag: 10, reserve: 30, reloadTime: 2.4,
    spreadStill: 0.002, spreadMoving: 0.03, spreadBloom: 0.004,
    recoilPitch: 0.025, recoilYaw: 0.006, range: 90, kick: 0.08, pellets: 1,
  },
};

export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;
const MUZZLE_TIME = 0.06;

// HD first-person viewmodels: each weapon is built from many distinct parts
// (receiver, barrel, magazine, stock, grip, handguard, muzzle, sight/scope) in
// several materials, so the silhouette reads clearly at 1280x720. Forward is -Z;
// the muzzle tip sits near local z -0.5 so it meets the flash at world z -0.85.
function buildViewModel(kind) {
  const M = {
    body: new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.42, metalness: 0.72 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x59616c, roughness: 0.32, metalness: 0.88 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.5, metalness: 0.6 }),
    polymer: new THREE.MeshStandardMaterial({ color: 0x3b332a, roughness: 0.9, metalness: 0.05 }),
    tan: new THREE.MeshStandardMaterial({ color: 0x6e5638, roughness: 0.8, metalness: 0.05 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b4a26, roughness: 0.75, metalness: 0.05 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xf0a830, roughness: 0.35, metalness: 0.4 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0d1b26, roughness: 0.08, metalness: 0.95 }),
  };
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
    // P9 Sidearm — compact slide pistol. 14 parts, 5 materials.
    part(0.055, 0.045, 0.26, 0, 0.045, -0.06, M.steel);          // slide
    part(0.058, 0.02, 0.03, 0, 0.05, 0.03, M.dark);              // slide serration band
    part(0.058, 0.02, 0.03, 0, 0.05, 0.06, M.dark);              // slide serration band
    part(0.05, 0.06, 0.22, 0, -0.005, -0.04, M.body);            // frame
    tube(0.016, 0.03, 0, 0.045, -0.2, M.dark);                    // barrel tip
    tube(0.02, 0.012, 0, 0.045, -0.205, M.steel);                 // muzzle ring
    part(0.008, 0.02, 0.008, 0, 0.078, -0.17, M.accent);          // front sight (amber)
    part(0.03, 0.015, 0.012, 0, 0.075, 0.05, M.dark);             // rear sight
    part(0.056, 0.015, 0.05, 0, 0.055, -0.1, M.dark);             // ejection port inset
    part(0.05, 0.13, 0.06, 0, -0.09, 0.045, M.polymer, 0.18);     // grip, raked back
    part(0.055, 0.015, 0.065, 0, -0.155, 0.055, M.dark);          // magazine base plate
    part(0.008, 0.03, 0.012, 0, -0.045, -0.075, M.dark);          // trigger
    part(0.008, 0.008, 0.07, 0, -0.062, -0.055, M.dark);          // trigger guard bar
    part(0.012, 0.025, 0.015, 0, 0.06, 0.06, M.dark);             // hammer
  } else if (kind === 'smg') {
    // Raptor-9 — short boxy SMG with suppressor shroud and red dot. 19 parts, 5 materials.
    part(0.08, 0.09, 0.26, 0, 0, 0, M.body);                     // receiver
    part(0.05, 0.012, 0.24, 0, 0.052, 0, M.dark);                // top rail
    part(0.052, 0.014, 0.012, 0, 0.052, -0.08, M.steel);         // rail slot
    part(0.052, 0.014, 0.012, 0, 0.052, 0, M.steel);             // rail slot
    part(0.052, 0.014, 0.012, 0, 0.052, 0.08, M.steel);          // rail slot
    tube(0.03, 0.22, 0, 0.01, -0.24, M.dark);                     // suppressor shroud
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
  } else if (kind === 'sniper') {
    // Longshot — long bolt-action with big scope and bipod. 23 parts, 6 materials.
    part(0.08, 0.09, 0.34, 0, 0, -0.06, M.body);                 // receiver
    tube(0.02, 0.34, 0, 0.015, -0.4, M.steel);                    // long barrel
    tube(0.035, 0.07, 0, 0.015, -0.56, M.dark);                   // muzzle brake
    part(0.075, 0.012, 0.03, 0, 0.015, -0.545, M.steel);          // brake port
    part(0.075, 0.012, 0.03, 0, 0.015, -0.575, M.steel);          // brake port
    tube(0.028, 0.24, 0, 0.085, -0.1, M.dark);                    // scope tube
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
    // S12K — wide pump shotgun with box magazine and ghost-ring sight. 19 parts, 6 materials.
    part(0.09, 0.1, 0.3, 0, 0, 0, M.body);                       // wide receiver
    tube(0.024, 0.3, 0, 0.03, -0.3, M.steel);                     // thick barrel
    tube(0.02, 0.26, 0, -0.035, -0.28, M.dark);                   // magazine tube
    part(0.095, 0.08, 0.18, 0, -0.01, -0.26, M.wood);             // pump forend
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
  } else if (kind === 'dmr') {
    // DMR-14 — scoped marksman rifle with long handguard and bipod. 24 parts, 6 materials.
    part(0.075, 0.085, 0.36, 0, 0, -0.04, M.body);                // receiver
    tube(0.019, 0.32, 0, 0.012, -0.38, M.steel);                  // barrel
    tube(0.03, 0.06, 0, 0.012, -0.54, M.dark);                    // muzzle brake
    part(0.07, 0.07, 0.24, 0, 0, -0.28, M.polymer);               // handguard
    part(0.072, 0.008, 0.014, 0, 0.038, -0.2, M.steel);           // handguard rail slot
    part(0.072, 0.008, 0.014, 0, 0.038, -0.28, M.steel);          // handguard rail slot
    part(0.072, 0.008, 0.014, 0, 0.038, -0.36, M.steel);          // handguard rail slot
    tube(0.026, 0.22, 0, 0.08, -0.08, M.dark);                    // scope tube
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
    // VK-47 — wood-furnished rifle with curved magazine. 20 parts, 6 materials.
    part(0.075, 0.085, 0.3, 0, 0, -0.02, M.body);                 // receiver
    part(0.06, 0.02, 0.28, 0, 0.052, -0.02, M.steel);             // top cover
    tube(0.018, 0.3, 0, 0.01, -0.32, M.steel);                    // barrel
    tube(0.028, 0.06, 0, 0.01, -0.48, M.dark);                    // muzzle brake
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

// A thrown frag grenade: a small dark sphere that arcs, bounces once, then explodes.
export function createGrenade(scene, colliders) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 10),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.metal), roughness: 0.4, metalness: 0.6 }),
  );
  mesh.visible = false;
  scene.add(mesh);
  const pos = new THREE.Vector3();
  const vel = new THREE.Vector3();
  let fuse = 0;
  let active = false;
  let bounced = false;

  return {
    get active() { return active; },
    get position() { return pos; },
    throwFrom(origin, direction) {
      pos.copy(origin);
      vel.copy(direction).multiplyScalar(16);
      vel.y += 4.5;
      fuse = 1.4;
      active = true;
      bounced = false;
      mesh.visible = true;
      mesh.position.copy(pos);
    },
    step(dt) {
      if (!active) return false;
      vel.y -= 14 * dt;
      const next = pos.clone().addScaledVector(vel, dt);
      if (next.y < 0.09) {
        next.y = 0.09;
        if (Math.abs(vel.y) > 2 && !bounced) { vel.y = -vel.y * 0.45; vel.x *= 0.7; vel.z *= 0.7; bounced = true; }
        else { vel.y = 0; vel.x *= 0.8; vel.z *= 0.8; }
      }
      for (const c of colliders) {
        if (next.x > c.min.x - 0.09 && next.x < c.max.x + 0.09 && next.y > c.min.y - 0.09 && next.y < c.max.y + 0.09 && next.z > c.min.z - 0.09 && next.z < c.max.z + 0.09) {
          vel.x *= -0.4; vel.z *= -0.4; vel.y *= 0.4;
          next.copy(pos);
          break;
        }
      }
      pos.copy(next);
      mesh.position.copy(pos);
      mesh.rotation.x += dt * 9;
      mesh.rotation.z += dt * 6;
      fuse -= dt;
      if (fuse <= 0) {
        active = false;
        mesh.visible = false;
        return true;
      }
      return false;
    },
  };
}
