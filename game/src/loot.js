// Loot: scattered ground pickups, PUBG-style. One or two pickups per loot spot,
// rolled from a seeded rng so a round's loot layout is reproducible.
// Meshes are small (<0.6 m), sit on the ground and bob + spin slowly so players
// notice them. No network, no DOM. The coordinator owns pickup rules (press E,
// equip, reserve ammo, armor values); this module only spawns, animates and
// hands out descriptors.
import * as THREE from 'three';
import { MAP } from './world.js';

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

// Roll per spot: 35% weapon, 20% ammo, 15% armor, 20% heal, 10% grenade.
const LOOT_TABLE = [
  ['weapon', 0.35],
  ['ammo', 0.20],
  ['armor', 0.15],
  ['heal', 0.20],
  ['grenade', 0.10],
];

// Weighted weapon roll: rifle 30%, smg 25%, shotgun 20%, dmr 15%, sniper 10%.
const WEAPON_TABLE = [
  ['rifle', 0.30],
  ['smg', 0.25],
  ['shotgun', 0.20],
  ['dmr', 0.15],
  ['sniper', 0.10],
];

// Reserve ammo a weapon pickup grants on top of the weapon itself. Values match
// the WEAPONS mag sizes in weapons.js where the weapon exists there; shotgun /
// dmr have no WEAPONS def yet (see note at the bottom) so these are the amounts
// the coordinator should grant once those defs land.
export const WEAPON_PICKUP_AMMO = {
  rifle: 30,
  smg: 32,
  shotgun: 8,
  dmr: 10,
  sniper: 5,
};

const AMMO_PICKUP_AMOUNT = 30;
const GRENADE_PICKUP_COUNT = 1;

// Armor tier roll: tier 1 50%, tier 2 35%, tier 3 15%.
// Vest tier t absorbs armor value t * 25 (25 / 50 / 75).
export const ARMOR_VALUE_PER_TIER = 25;
const ARMOR_TIER_TABLE = [[1, 0.50], [2, 0.35], [3, 0.15]];

const HEAL_ITEMS = ['bandage', 'medkit', 'drink'];

// Fallback spots, used only if MAP.lootSpots is not present yet (world.js is
// expected to gain MAP.lootSpots: [{x, z}, ...], >= 14 spots). All are open
// ground, clear of crates / containers / the watchtower legs.
const FALLBACK_LOOT_SPOTS = [
  { x: -16, z: -5 }, { x: -14, z: -11 }, { x: -18, z: -6 },
  { x: 16, z: -5 }, { x: 14, z: -11 }, { x: 18, z: -6 },
  { x: -5, z: 2 }, { x: 5, z: 2 }, { x: 0, z: 8 },
  { x: -8, z: -8 }, { x: 8, z: -8 }, { x: -8, z: 8 }, { x: 8, z: 8 },
  { x: 0, z: -10 }, { x: 0, z: 12 }, { x: -17, z: 6 }, { x: 17, z: 6 },
];

function weightedPick(table, rng) {
  let roll = rng();
  for (const [value, weight] of table) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return table[table.length - 1][0];
}

/** Weighted weapon roll for bots and loot: rifle 30 / smg 25 / shotgun 20 / dmr 15 / sniper 10. */
export function randomWeapon(rng = Math.random) {
  return weightedPick(WEAPON_TABLE, rng);
}

function rollArmorTier(rng) {
  return weightedPick(ARMOR_TIER_TABLE, rng);
}

// ---------------------------------------------------------------------------
// Meshes — one small group per pickup, distinct color/shape per kind.
// ---------------------------------------------------------------------------

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.25, ...opts });
}

function buildWeaponMesh(weaponId) {
  // Dark gun-shaped box lying on the ground: long body + barrel + grip.
  const group = new THREE.Group();
  const dark = mat(0x1c1f24, { metalness: 0.55, roughness: 0.45 });
  const accent = mat(0x8a6d2f, { metalness: 0.4, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.42), dark);
  body.position.y = 0.05;
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.22), dark);
  barrel.position.set(0, 0.05, -0.3);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.08), accent);
  grip.position.set(0, 0.02, 0.14);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.07), dark);
  mag.position.set(0, 0.01, -0.02);
  group.add(body, barrel, grip, mag);
  // Sniper gets a slightly longer barrel so it reads differently at a glance.
  if (weaponId === 'sniper') barrel.scale.z = 1.4;
  if (weaponId === 'shotgun') body.scale.set(1.15, 1.15, 1.15);
  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  return group;
}

function buildAmmoMesh() {
  // Small amber box.
  const group = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.16), mat(0xd9901f));
  box.position.y = 0.06;
  group.add(box);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.03, 0.17), mat(0x2b2b2b));
  stripe.position.y = 0.06;
  group.add(stripe);
  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  return group;
}

function buildArmorMesh(slot, tier) {
  // Blue-grey vest box; tier shown by size + brightness (t3 biggest/brightest).
  const group = new THREE.Group();
  const scale = 0.85 + tier * 0.15; // t1 1.0, t2 1.15, t3 1.3
  const brightness = [0x5a6b7d, 0x6f87a3, 0x9fc3e8][tier - 1];
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.34 * scale, 0.1, 0.26 * scale), mat(brightness, { roughness: 0.85, metalness: 0.05 }));
  vest.position.y = 0.05;
  group.add(vest);
  if (slot === 'helmet') {
    // Helmet: a half-dome on top of a small base instead of a flat vest.
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.14 * scale, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      mat(brightness, { roughness: 0.5, metalness: 0.3 }),
    );
    dome.position.y = 0.1;
    group.add(dome);
  } else {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.36 * scale, 0.03, 0.06), mat(0x2e3844));
    strap.position.y = 0.11;
    group.add(strap);
  }
  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  return group;
}

function buildHealMesh(item) {
  // Bandage: small white box. Medkit: bigger white box + red cross.
  // Drink: small blue can (cylinder).
  const group = new THREE.Group();
  if (item === 'drink') {
    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.16, 12),
      mat(0x2f7fc2, { metalness: 0.5, roughness: 0.35 }),
    );
    can.position.y = 0.08;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12), mat(0xd8dee6, { metalness: 0.7 }));
    lid.position.y = 0.17;
    group.add(can, lid);
  } else {
    const size = item === 'medkit' ? 0.3 : 0.2;
    const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(size, 0.1, size * 0.7), mat(0xf2f0ea, { roughness: 0.7 }));
    boxMesh.position.y = 0.05;
    group.add(boxMesh);
    const crossMat = mat(0xc22e2e, { roughness: 0.6 });
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.14), crossMat);
    crossV.position.y = 0.105;
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.05), crossMat);
    crossH.position.y = 0.105;
    group.add(crossV, crossH);
  }
  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  return group;
}

function buildGrenadeMesh() {
  // Small dark sphere.
  const group = new THREE.Group();
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 10),
    mat(0x24262b, { metalness: 0.6, roughness: 0.4 }),
  );
  ball.position.y = 0.09;
  const pin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.08), mat(0x9aa2ad, { metalness: 0.7 }));
  pin.position.set(0.05, 0.16, 0);
  group.add(ball, pin);
  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  return group;
}

// ---------------------------------------------------------------------------
// Loot manager
// ---------------------------------------------------------------------------

export function createLoot(scene, world, rng = Math.random) {
  const spots = (MAP.lootSpots && MAP.lootSpots.length > 0) ? MAP.lootSpots : FALLBACK_LOOT_SPOTS;
  let nextId = 1;

  // {id, kind, weaponId|item|tier|slot, amount, pos: THREE.Vector3, mesh, taken}
  // kind: 'weapon' | 'ammo' | 'armor' | 'heal' | 'grenade'
  // weapon: { weaponId, amount }            amount = reserve ammo granted
  // ammo:   { amount }                      amount = reserve rounds added
  // armor:  { slot: 'vest'|'helmet', tier, armorValue }  vest armorValue = tier*25
  // heal:   { item: 'bandage'|'medkit'|'drink', amount: 1 }
  // grenade:{ amount }                      amount = grenades granted
  const pickups = [];

  function rollPickup(x, z) {
    const kind = weightedPick(LOOT_TABLE, rng);
    const pos = new THREE.Vector3(x, 0, z);
    const base = { id: nextId, kind, pos, taken: false, mesh: null, baseY: 0, phase: rng() * Math.PI * 2 };
    nextId += 1;
    if (kind === 'weapon') {
      const weaponId = randomWeapon(rng);
      return { ...base, weaponId, amount: WEAPON_PICKUP_AMMO[weaponId], mesh: buildWeaponMesh(weaponId) };
    }
    if (kind === 'ammo') {
      return { ...base, amount: AMMO_PICKUP_AMOUNT, mesh: buildAmmoMesh() };
    }
    if (kind === 'armor') {
      const slot = rng() < 0.5 ? 'vest' : 'helmet';
      const tier = rollArmorTier(rng);
      return {
        ...base, slot, tier,
        armorValue: slot === 'vest' ? tier * ARMOR_VALUE_PER_TIER : 0,
        mesh: buildArmorMesh(slot, tier),
      };
    }
    if (kind === 'heal') {
      const item = HEAL_ITEMS[Math.floor(rng() * HEAL_ITEMS.length)];
      return { ...base, item, amount: 1, mesh: buildHealMesh(item) };
    }
    return { ...base, amount: GRENADE_PICKUP_COUNT, mesh: buildGrenadeMesh() };
  }

  function clearAll() {
    for (const p of pickups) {
      if (p.mesh) scene.remove(p.mesh);
    }
    pickups.length = 0;
  }

  function spawnLoot() {
    clearAll();
    for (const spot of spots) {
      // 1-2 pickups per spot; a second pickup is offset so meshes never overlap.
      const count = rng() < 0.5 ? 1 : 2;
      for (let i = 0; i < count; i += 1) {
        const ox = i === 0 ? 0 : (rng() - 0.5) * 0.9;
        const oz = i === 0 ? 0 : (rng() - 0.5) * 0.9;
        const pickup = rollPickup(spot.x + ox, spot.z + oz);
        pickup.mesh.position.set(pickup.pos.x, 0.15, pickup.pos.z);
        pickup.baseY = 0.15;
        // Face a random direction so gun-shaped pickups don't all align.
        pickup.mesh.rotation.y = rng() * Math.PI * 2;
        scene.add(pickup.mesh);
        pickups.push(pickup);
      }
    }
    return pickups;
  }

  function nearestPickup(pos, maxDist = 2.2) {
    let best = null;
    let bestD2 = maxDist * maxDist;
    for (const p of pickups) {
      if (p.taken) continue;
      const dx = p.pos.x - pos.x;
      const dz = p.pos.z - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = p; }
    }
    return best;
  }

  function takePickup(pickup) {
    if (!pickup || pickup.taken) return null;
    pickup.taken = true;
    if (pickup.mesh) scene.remove(pickup.mesh);
    // Descriptor the coordinator consumes: kind + the fields for that kind.
    return {
      kind: pickup.kind,
      weaponId: pickup.weaponId ?? null,
      tier: pickup.tier ?? null,
      slot: pickup.slot ?? null,
      item: pickup.item ?? null,
      amount: pickup.amount ?? 0,
      armorValue: pickup.armorValue ?? 0,
    };
  }

  function update(dt) {
    // Bob + slow spin on every untaken pickup (~25 meshes, cheap).
    const t = performance.now() * 0.001;
    for (const p of pickups) {
      if (p.taken || !p.mesh) continue;
      p.mesh.position.y = p.baseY + Math.sin(t * 1.6 + p.phase) * 0.05;
      p.mesh.rotation.y += dt * 0.9;
    }
  }

  return {
    pickups,
    spawnLoot,
    nearestPickup,
    takePickup,
    update,
  };
}

// NOTE for the coordinator: WEAPONS in weapons.js currently defines only
// pistol / rifle / smg / sniper. Loot can roll 'shotgun' and 'dmr' (per the
// loot table), so those two defs must be added to WEAPONS (with mag / reserve /
// view-model kind) before a shotgun/dmr pickup can be equipped; until then
// the coordinator should re-roll or skip those two ids.
