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
    recoilPitch: 0.012, recoilYaw: 0.004, range: 40, kick: 0.04,
  },
  rifle: {
    id: 'rifle', name: 'VK-47', kind: 'rifle', price: 2700,
    damage: 34, headMult: 4, fireGap: 0.11, auto: true,
    mag: 30, reserve: 90, reloadTime: 2.2,
    spreadStill: 0.004, spreadMoving: 0.028, spreadBloom: 0.0035,
    recoilPitch: 0.014, recoilYaw: 0.005, range: 60, kick: 0.055,
  },
  smg: {
    id: 'smg', name: 'Raptor-9', kind: 'smg', price: 1500,
    damage: 26, headMult: 4, fireGap: 0.07, auto: true,
    mag: 32, reserve: 96, reloadTime: 1.8,
    spreadStill: 0.01, spreadMoving: 0.04, spreadBloom: 0.005,
    recoilPitch: 0.01, recoilYaw: 0.006, range: 35, kick: 0.04,
  },
  sniper: {
    id: 'sniper', name: 'Longshot', kind: 'sniper', price: 4750,
    damage: 110, headMult: 2, fireGap: 1.2, auto: false,
    mag: 5, reserve: 15, reloadTime: 3.0,
    spreadStill: 0.001, spreadMoving: 0.05, spreadBloom: 0.002,
    recoilPitch: 0.05, recoilYaw: 0.01, range: 100, kick: 0.11,
  },
};

export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;
const MUZZLE_TIME = 0.06;

function buildViewModel(kind) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.metal), roughness: 0.45, metalness: 0.55 });
  const model = new THREE.Group();
  function part(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material || body);
    mesh.position.set(x, y, z);
    model.add(mesh);
    return mesh;
  }
  if (kind === 'pistol') {
    part(0.05, 0.09, 0.18, 0, 0, -0.08);
    part(0.045, 0.11, 0.06, 0, -0.06, 0.02, grip);
    part(0.02, 0.03, 0.02, 0, 0.06, -0.16, dark);
  } else if (kind === 'smg') {
    part(0.08, 0.09, 0.26, 0, 0, -0.06);
    part(0.04, 0.04, 0.2, 0, 0.02, -0.24, dark);
    part(0.05, 0.14, 0.06, 0, -0.09, 0.02, grip);
    part(0.06, 0.07, 0.12, 0, -0.02, 0.18, grip);
  } else if (kind === 'sniper') {
    part(0.08, 0.08, 0.34, 0, 0, -0.08);
    part(0.04, 0.04, 0.36, 0, 0.02, -0.34, dark);
    part(0.05, 0.05, 0.14, 0, 0.07, -0.14, dark);
    part(0.06, 0.07, 0.14, 0, -0.02, 0.18, grip);
    part(0.03, 0.03, 0.09, 0, 0.05, -0.3, dark);
  } else {
    part(0.08, 0.09, 0.3, 0, 0, -0.05);
    part(0.04, 0.04, 0.28, 0, 0.02, -0.28, dark);
    part(0.07, 0.07, 0.16, 0, -0.02, 0.2, grip);
    part(0.05, 0.04, 0.08, 0, 0.06, -0.12, dark);
  }
  model.position.set(0.32, -0.3, -0.6);
  model.scale.setScalar(0.5);
  return model;
}

export function createWeaponRig(camera, audio) {
  const models = {};
  for (const kind of ['pistol', 'rifle', 'smg', 'sniper']) {
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
