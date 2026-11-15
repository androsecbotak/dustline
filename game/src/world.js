// The map: DUSTLINE v3 — an abandoned desert oil refinery / mining outpost at
// dusk, 64x48m. Warm rust-orange palette with teal steel accents.
//   SITE A (west)  — REFINERY HALL: a big industrial shed with pipe racks,
//                    storage tanks, a flare stack and oil stains.
//   SITE B (east)  — PUMP COURT: a sandstone-walled court with two pumpjacks,
//                    wellheads and cable spools.
//   MID            — WATCHTOWER COURT: a watchtower, sandbags and a tall block.
// Lanes run north (tank row / court roofs), mid (through the watchtower court)
// and south (workshop / storehouse / mess hall). Vanguard spawns west, Crimson
// spawns east. Every structure reads as industrial: door lintels and frames,
// dark window recesses with trim, parapets, roof vent pipes and exhaust stacks,
// unit-marking plates, rust streaks, corrugated ribs, tarps and camo netting —
// no plain coloured boxes. Textures are procedural (textures.js); the sky is a
// gradient sphere; the sun is low and warm so shadows run long.
// Waypoints feed the bots' pathfinding; SITES / ZONES / locationAt feed the
// rounds worker and the HUD location banners.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import * as Textures from './textures.js';

export const MAP = {
  minX: -32, maxX: 32, minZ: -24, maxZ: 24,
  sites: {
    A: new THREE.Vector3(-18, 0, -8),
    B: new THREE.Vector3(18, 0, -8),
  },
  spawns: {
    // v3: Vanguard west, Crimson east (v2 was south/north; bots use dropPoints,
    // spawns are kept for compatibility and for round starts).
    vanguard: [new THREE.Vector3(-30, 0, 6), new THREE.Vector3(-30, 0, 10), new THREE.Vector3(-30, 0, 14)],
    crimson: [new THREE.Vector3(30, 0, 6), new THREE.Vector3(30, 0, 10), new THREE.Vector3(30, 0, 14)],
  },
  // Per-site defender hold positions (open ground, clear of colliders).
  holds: {
    A: [new THREE.Vector3(-20, 0, -11), new THREE.Vector3(-14, 0, -6), new THREE.Vector3(-11, 0, -9)],
    B: [new THREE.Vector3(15, 0, -9), new THREE.Vector3(19, 0, -8.5), new THREE.Vector3(23, 0, -8)],
  },
  // Loot spots: open ground, at least 2m from any collider, spread across the map.
  lootSpots: [
    { x: -23.5, z: -17.5 }, { x: 24, z: -17.5 },
    { x: 0, z: -16.5 },
    { x: -8, z: -8 }, { x: 8, z: -8 },
    { x: -20, z: 2 }, { x: 20, z: 2 },
    { x: -29.5, z: 8 }, { x: 29.5, z: 8 },
    { x: -6, z: 17 }, { x: 6, z: 17 },
    { x: -15, z: 17 }, { x: 15, z: 17 },
    { x: 0, z: 14 },
    { x: 28, z: -18 },
    { x: -16, z: -20 }, { x: 16, z: -20 },
  ],
  // Drop points: exactly 12, spread across the map, at least 3m apart from each
  // other, on open ground clear of colliders.
  dropPoints: [
    { x: -28, z: 18 }, { x: 28, z: 18 },
    { x: -29.5, z: -3.5 }, { x: 29.5, z: -3.5 },
    { x: -14, z: 10 }, { x: 14, z: 10 },
    { x: -16, z: -18 }, { x: 16, z: -18 },
    { x: -4, z: -8 }, { x: 4, z: -8 },
    { x: -18, z: 17 }, { x: 18, z: 17 },
  ],
};

// Named sites for the rounds worker: centre + radius, in plain {x, z} form.
export const SITES = {
  A: { name: 'REFINERY HALL', pos: { x: -18, z: -8 }, radius: 9 },
  B: { name: 'PUMP COURT', pos: { x: 18, z: -8 }, radius: 9 },
};

// Named location zones for the HUD banner. Checked in order (first match wins),
// so the sites and the mid court take priority over the lanes and yards.
export const ZONES = [
  { id: 'A', name: 'SITE A — REFINERY HALL', minX: -29, maxX: -11, minZ: -23, maxZ: -1 },
  { id: 'B', name: 'SITE B — PUMP COURT', minX: 11, maxX: 29, minZ: -17, maxZ: 1 },
  { id: 'MID', name: 'WATCHTOWER COURT', minX: -9, maxX: 9, minZ: -6, maxZ: 10 },
  { id: 'NORTH', name: 'NORTH LANE', minX: -32, maxX: 32, minZ: -24, maxZ: -6 },
  { id: 'WEST', name: 'WEST YARD', minX: -32, maxX: -9, minZ: -17, maxZ: 24 },
  { id: 'EAST', name: 'EAST YARD', minX: 9, maxX: 32, minZ: -17, maxZ: 24 },
  { id: 'SOUTH', name: 'SOUTH YARD', minX: -9, maxX: 9, minZ: 10, maxZ: 24 },
];

export function locationAt(x, z) {
  for (const zone of ZONES) {
    if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) return zone;
  }
  return { id: 'OUTPOST', name: 'DUSTLINE OUTPOST', minX: MAP.minX, maxX: MAP.maxX, minZ: MAP.minZ, maxZ: MAP.maxZ };
}

const WAYPOINTS = [
  // North row (z -22) — tank row / court roofs. The west end sits in the gap
  // between the tank farm and the hall so the row stays connected.
  [-25.8, -17.5], [-16, -22], [-4, -22], [4, -22], [16, -22], [28, -22],
  // z -17 row — between the tanks/hall and the north containers.
  [-20, -17], [-8, -17], [8, -17], [22, -17],
  // z -11.5 row — hall east door / court approach.
  [-8, -11.5], [8, -11.5], [20, -11.5], [29, -11.5],
  // z -5 row — south of both sites. The west/east ends sit at z -1, south of
  // the hall west wall / court east wall, so the lanes stay connected.
  [-29, -1], [-18, -5], [-8, -5], [8, -5], [18, -5], [29, -1],
  // z +4 row — mid lanes.
  [-22, 4], [-12, 4], [12, 4], [22, 4],
  // z +12 row — workshop / storehouse lane.
  [-29, 12], [-18, 12], [-8, 12], [0, 12], [8, 12], [18, 12], [29, 12],
  // South row (z +20).
  [-28, 20], [-21, 20], [-11, 20], [11, 20], [21, 20], [28, 20],
  // West / east lanes.
  [-30, -7], [-30, 6], [30, -7], [30, 6],
  // Site A: hall interior (reached through the east and south doorways) + doors.
  [-18, -12], [-18, -8], [-11, -9], [-18, -1],
  // Site B: court interior + east exit.
  [18, -8], [23, -8],
  // Spawns (west Vanguard, east Crimson).
  [-30, 10], [30, 10],
  // Mid court, either side of the watchtower.
  [-5, 0], [5, 0],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  const sand = Textures.sandTexture();
  sand.repeat.set(16, 12);
  const concrete = Textures.concreteTexture();
  concrete.repeat.set(4, 2);
  const containerTex = Textures.containerTexture(PALETTE.container);
  const containerRustTex = Textures.containerTexture(PALETTE.containerRust);
  const crateTex = Textures.crateTexture();
  const sandbagTex = Textures.sandbagTexture();
  const metalTex = Textures.metalTexture();
  const sandstoneTex = Textures.sandstoneTexture();
  const corrugatedTex = Textures.corrugatedTexture('#8a6a4a');
  const corrugatedTealTex = Textures.corrugatedTexture(PALETTE.teal);
  const pipeTex = Textures.pipeTexture();
  const tankRustTex = Textures.tankTexture(PALETTE.containerRust);
  const tankTealTex = Textures.tankTexture(PALETTE.teal);

  const matSand = new THREE.MeshStandardMaterial({ map: sand, roughness: 0.96, metalness: 0 });
  const matConcrete = new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.92, metalness: 0.02 });
  const matConcreteDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.concreteDark), roughness: 0.9, metalness: 0.02 });
  const matSandstone = new THREE.MeshStandardMaterial({ map: sandstoneTex, roughness: 0.95, metalness: 0 });
  const matSandstoneDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sandstoneDark), roughness: 0.95, metalness: 0 });
  const matCorrugated = new THREE.MeshStandardMaterial({ map: corrugatedTex, roughness: 0.7, metalness: 0.35 });
  const matCorrugatedTeal = new THREE.MeshStandardMaterial({ map: corrugatedTealTex, roughness: 0.7, metalness: 0.35 });
  const matPipe = new THREE.MeshStandardMaterial({ map: pipeTex, roughness: 0.6, metalness: 0.45 });
  const matTankRust = new THREE.MeshStandardMaterial({ map: tankRustTex, roughness: 0.65, metalness: 0.3 });
  const matTankTeal = new THREE.MeshStandardMaterial({ map: tankTealTex, roughness: 0.65, metalness: 0.3 });
  const matContainer = new THREE.MeshStandardMaterial({ map: containerTex, roughness: 0.75, metalness: 0.25 });
  const matContainerRust = new THREE.MeshStandardMaterial({ map: containerRustTex, roughness: 0.8, metalness: 0.2 });
  const matCrate = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.85, metalness: 0 });
  const matSandbag = new THREE.MeshStandardMaterial({ map: sandbagTex, roughness: 0.98, metalness: 0 });
  const matMetal = new THREE.MeshStandardMaterial({ map: metalTex, roughness: 0.55, metalness: 0.5 });
  const matAccent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.6, metalness: 0.1, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.25 });
  const matFlare = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.flare), roughness: 0.4, metalness: 0, emissive: new THREE.Color('#ff7a2a'), emissiveIntensity: 2.2 });

  // ---- Visual-detail materials (detail pass only; nothing here collides) ----
  const matDark = new THREE.MeshStandardMaterial({ color: 0x241c14, roughness: 1, metalness: 0 });
  const matTrim = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.concreteDark), roughness: 0.9, metalness: 0.02 });
  const matRust = new THREE.MeshStandardMaterial({ color: 0x5e3a22, roughness: 0.95, metalness: 0.05 });
  const matTarpGreen = new THREE.MeshStandardMaterial({ color: 0x5a6350, roughness: 0.95, metalness: 0 });
  const matTarpTan = new THREE.MeshStandardMaterial({ color: 0xa8895a, roughness: 0.95, metalness: 0 });
  const matCamo = new THREE.MeshStandardMaterial({ color: 0x2e3d24, roughness: 1, metalness: 0, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const matRock = new THREE.MeshStandardMaterial({ color: 0x5d5142, roughness: 1, metalness: 0 });
  const matRockDark = new THREE.MeshStandardMaterial({ color: 0x463c2e, roughness: 1, metalness: 0 });
  const matOil = new THREE.MeshBasicMaterial({ map: Textures.oilStainTexture(), transparent: true, depthWrite: false });

  // Deterministic PRNG for the detail pass (mulberry32, same pattern as textures.js).
  function rngDetail(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Visual-only meshes: never added to `colliders`. Only `vbox` can opt a mesh
  // into `shootables`, and only for pieces that sit above an existing collider
  // (the roof parapets), so a bullet stops on a visible lip instead of passing
  // through it. Everything else stays out of `shootables` too.
  function vbox(w, h, d, x, y, z, material, rotY = 0, shootable = false) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (shootable) shootables.push(mesh);
    return mesh;
  }
  function vplane(w, h, x, y, z, material, rotY = 0) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  function vcyl(rTop, rBot, h, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 10), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  function rock(x, z, s, mat, ry = 0, tilt = 0) {
    const mesh = new THREE.Mesh(rockGeo, mat);
    mesh.scale.setScalar(s);
    mesh.position.set(x, s * 0.28, z);
    mesh.rotation.set(tilt, ry, tilt * 0.6);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  function tank(r, h, x, z, material) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), material);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3(new THREE.Vector3(x - r, 0, z - r), new THREE.Vector3(x + r, h, z + r)));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and perimeter.
  box(64.6, 0.4, 48.6, 0, -0.2, 0, matSand);
  box(64.6, 4.2, 0.6, 0, 2.1, -24.3, matConcrete);
  box(64.6, 4.2, 0.6, 0, 2.1, 24.3, matConcrete);
  box(0.6, 4.2, 48.6, -32.3, 2.1, 0, matConcrete);
  box(0.6, 4.2, 48.6, 32.3, 2.1, 0, matConcrete);

  // ---- SITE A (west): REFINERY HALL, x -27..-13, z -15..-3 ----
  // 14x12m industrial shed, 4.5m walls, doorways east (to mid) and south.
  box(14, 4.5, 0.5, -20, 2.25, -15, matConcrete); // north wall
  box(8, 4.5, 0.5, -23, 2.25, -3, matConcrete); // south wall, west segment
  box(4, 4.5, 0.5, -15, 2.25, -3, matConcrete); // south wall, east segment (gap x -19..-17)
  box(0.5, 4.5, 12, -27, 2.25, -9, matConcrete); // west wall
  box(0.5, 4.5, 5, -13, 2.25, -12.5, matConcrete); // east wall, north segment
  box(0.5, 4.5, 5, -13, 2.25, -5.5, matConcrete); // east wall, south segment (gap z -10..-8)
  box(14.6, 0.3, 12.6, -20, 4.65, -9, matConcreteDark); // roof slab
  // Interior: three vertical pipe columns along the north wall, one process tank.
  box(0.8, 4.5, 0.8, -24, 2.25, -14, matPipe);
  box(0.8, 4.5, 0.8, -20, 2.25, -14, matPipe);
  box(0.8, 4.5, 0.8, -16, 2.25, -14, matPipe);
  tank(1.5, 3, -25, -5, matTankTeal);
  // Interior crate stack (clear of the door lanes and hold positions).
  box(1.2, 1.2, 1.2, -24.5, 0.6, -11, matCrate);
  box(1.2, 1.2, 1.2, -23.3, 0.6, -11, matCrate);
  box(1.2, 1.2, 1.2, -23.9, 1.8, -11, matCrate);

  // Tank farm along the west wall + the flare stack in the NW corner.
  tank(2.0, 5, -29.5, -12, matTankRust);
  tank(2.0, 5, -29.5, -18, matTankTeal);
  tank(1.6, 4, -22, -21.5, matTankRust);
  box(1, 13, 1, -29.5, 6.5, -21.5, matPipe); // flare stack column
  // Elevated pipe rack: hall east wall -> mid, posts only collide, pipes are high.
  box(0.4, 2.8, 0.4, -11, 1.4, -13.5, matPipe);
  box(0.4, 2.8, 0.4, -5, 1.4, -13.5, matPipe);
  // Oil drums south of the hall.
  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 14);
  function barrel(bx, bz, material) {
    const b = new THREE.Mesh(barrelGeo, material);
    b.position.set(bx, 0.55, bz);
    b.castShadow = true;
    b.receiveShadow = true;
    group.add(b);
    colliders.push(new THREE.Box3(new THREE.Vector3(bx - 0.45, 0, bz - 0.45), new THREE.Vector3(bx + 0.45, 1.1, bz + 0.45)));
    shootables.push(b);
    return b;
  }
  barrel(-24, 0.8, matMetal);
  barrel(-12, 0.8, matMetal);

  // ---- SITE B (east): PUMP COURT, x 12..26, z -15..-1 ----
  // Sandstone walls, 2.6m high, open to the west (entrance from mid), exit gap
  // in the east wall.
  box(14, 2.6, 0.6, 19, 1.3, -15, matSandstone); // north wall
  box(14, 2.6, 0.6, 19, 1.3, -1, matSandstone); // south wall
  box(0.6, 2.6, 6, 26, 1.3, -12, matSandstone); // east wall, north segment
  box(0.6, 2.6, 6, 26, 1.3, -4, matSandstone); // east wall, south segment (gap z -9..-7)
  // Pumpjacks (collider = base box; the beam and frame above are visual only).
  box(2.6, 1.4, 1.6, 16, 0.7, -11, matMetal);
  box(2.6, 1.4, 1.6, 21, 0.7, -5.5, matMetal);
  // Wellheads.
  box(1.2, 1.0, 1.2, 14, 0.5, -4, matPipe);
  box(1.2, 1.0, 1.2, 23, 0.5, -12, matPipe);
  // Cable spools (cylinders on their side; collider = box).
  box(1.6, 1.8, 1.6, 23.5, 0.9, -3.5, matCrate);
  box(1.6, 1.8, 1.6, -23.5, 0.9, -3.5, matCrate);

  // ---- MID: WATCHTOWER COURT ----
  // Watchtower (decorative, blocks movement): four legs and a platform with a rail.
  for (const [lx, lz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
    box(0.35, 3.4, 0.35, lx, 1.7, lz, matMetal);
  }
  box(3.6, 0.3, 3.6, 0, 3.55, 0, matMetal);
  box(3.6, 0.7, 0.15, 0, 4.05, -1.8, matMetal);
  box(3.6, 0.7, 0.15, 0, 4.05, 1.8, matMetal);
  box(0.15, 0.7, 3.6, -1.8, 4.05, 0, matMetal);
  box(0.15, 0.7, 3.6, 1.8, 4.05, 0, matMetal);
  // Mid cover: a chest-high sandbag block to shoot over, a tall block that
  // breaks the long sightline, crates around it.
  box(6, 1.1, 3, 0, 0.55, 7, matSandbag);
  box(3, 2.4, 3, 0, 1.2, -4, matConcreteDark);
  box(1.2, 1.2, 1.2, -3, 0.6, -3, matCrate);
  box(1.2, 1.2, 1.2, 3, 0.6, -3, matCrate);
  box(1.2, 1.2, 1.2, 0, 0.6, -6, matCrate);

  // ---- SOUTH BUILDINGS: WORKSHOP (west), STOREHOUSE (east), MESS HALL (centre) ----
  // Workshop: corrugated shed, footprint x -27..-21, z 9.5..14.5, doorway south.
  box(6, 3, 0.4, -24, 1.5, 14.5, matCorrugated);
  box(2.2, 3, 0.4, -25.9, 1.5, 9.5, matCorrugated);
  box(2.2, 3, 0.4, -22.1, 1.5, 9.5, matCorrugated);
  box(0.4, 3, 5, -27, 1.5, 12, matCorrugated);
  box(0.4, 3, 5, -21, 1.5, 12, matCorrugated);
  box(6.4, 0.3, 5.4, -24, 3.15, 12, matConcreteDark);
  // Storehouse: teal corrugated shed, footprint x 21..27, z 9.5..14.5, doorway south.
  box(6, 3, 0.4, 24, 1.5, 14.5, matCorrugatedTeal);
  box(2.2, 3, 0.4, 22.1, 1.5, 9.5, matCorrugatedTeal);
  box(2.2, 3, 0.4, 25.9, 1.5, 9.5, matCorrugatedTeal);
  box(0.4, 3, 5, 21, 1.5, 12, matCorrugatedTeal);
  box(0.4, 3, 5, 27, 1.5, 12, matCorrugatedTeal);
  box(6.4, 0.3, 5.4, 24, 3.15, 12, matConcreteDark);
  // Mess hall: concrete, footprint x -3..3, z 18..22, doorway south.
  box(6, 3, 0.4, 0, 1.5, 22, matConcrete);
  box(2.2, 3, 0.4, -1.9, 1.5, 18, matConcrete);
  box(2.2, 3, 0.4, 1.9, 1.5, 18, matConcrete);
  box(0.4, 3, 4, -3, 1.5, 20, matConcrete);
  box(0.4, 3, 4, 3, 1.5, 20, matConcrete);
  box(6.4, 0.3, 4.4, 0, 3.15, 20, matConcreteDark);

  // ---- Container yard ----
  box(5.5, 2.6, 2.4, -28, 1.3, 2, matContainerRust);
  box(5.5, 2.6, 2.4, 28, 1.3, 2, matContainer);
  box(5.5, 2.6, 2.4, -10, 1.3, -20, matContainer);
  box(5.5, 2.6, 2.4, 10, 1.3, -20, matContainerRust);
  box(5.5, 2.6, 2.4, -16, 1.3, 22, matContainerRust);
  box(5.5, 2.6, 2.4, 16, 1.3, 22, matContainer);

  // ---- Extra crates spread across the map ----
  for (const [cx, cz] of [
    [-21, -4.5], [20, -2], [-19, 6], [19, 6],
    [-13.5, 6], [13.5, 6], [-12, -6], [12, -6],
    [-7, 20], [7, 20],
    [-6, -20.5], [6, -20.5], [-27, 4], [27, 4],
    [-25, 16], [25, 16], [-9, 15.5], [9, 15.5],
    [0, 9.5],
  ]) box(1.2, 1.2, 1.2, cx, 0.6, cz, matCrate);

  // ---- Extra sandbag lines ----
  for (const [sx, sz] of [[-10, 8], [10, 8], [-12, -18], [12, -18], [-10, 18], [10, 18]]) {
    box(4, 1.1, 0.8, sx, 0.55, sz, matSandbag);
  }

  // ---- Barrels (oil drums) ----
  for (const [bx, bz] of [
    [-8, 4], [8, 4], [-14, 2], [14, 2], [-4, -12], [4, -12],
    [-26, 6], [26, 6], [-26, -6], [26, -6], [-12, 16], [12, 16],
    [-12, -16], [12, -16],
  ]) barrel(bx, bz, matMetal);

  // ---- Visual detail pass: industrial dressing, visual only. ----
  // No collider, waypoint, lootSpot or dropPoint is touched here; every mesh
  // below is decoration except the roof parapets (shootable, above the roof
  // collider). All prop positions were checked >= 1.5m from waypoints, loot
  // spots and drop points; the rock scatter filters for that at runtime.

  // Small buildings: doorway lintel + frame strips + threshold, a faded
  // unit-marking plate beside the door, dark window recesses with trim on the
  // solid walls, a parapet lip around the roofline, a vent pipe, an AC box, and
  // a sandbag or crate prop against the door wall.
  function detailHouse(cx, cz, depth, doorSide, prop) {
    const d = depth;
    const doorZ = cz + (doorSide === 'S' ? -d / 2 : d / 2);
    const oppZ = cz + (doorSide === 'S' ? d / 2 : -d / 2);
    const out = doorSide === 'S' ? -1 : 1; // exterior direction of the door wall
    const ow = -out; // exterior direction of the opposite wall
    const doorFace = doorZ + out * 0.2;
    const oppFace = oppZ + ow * 0.2;
    // Doorway: lintel above the 1.6m gap, frame strips flanking it, threshold.
    vbox(2.0, 0.3, 0.14, cx, 2.5, doorFace + out * 0.04, matTrim);
    vbox(0.14, 2.4, 0.12, cx - 0.87, 1.2, doorFace + out * 0.03, matTrim);
    vbox(0.14, 2.4, 0.12, cx + 0.87, 1.2, doorFace + out * 0.03, matTrim);
    vbox(1.7, 0.06, 0.6, cx, 0.03, doorZ, matDark);
    // Faded unit-marking plate + accent stripe beside the door.
    vplane(0.7, 0.9, cx - 2.2, 1.9, doorFace + out * 0.03, matDark, out === 1 ? 0 : Math.PI);
    vbox(0.7, 0.07, 0.04, cx - 2.2, 2.42, doorFace + out * 0.04, matAccent);
    // Windows: trim panel + dark recess on the solid opposite wall.
    for (const wx of [cx - 1.8, cx + 1.8]) {
      vplane(1.15, 1.25, wx, 1.6, oppFace + ow * 0.02, matTrim, ow === 1 ? 0 : Math.PI);
      vplane(0.95, 1.05, wx, 1.6, oppFace + ow * 0.04, matDark, ow === 1 ? 0 : Math.PI);
    }
    // One window on each side wall.
    vplane(1.15, 1.25, cx - 3.21, 1.6, cz, matTrim, -Math.PI / 2);
    vplane(0.95, 1.05, cx - 3.23, 1.6, cz, matDark, -Math.PI / 2);
    vplane(1.15, 1.25, cx + 3.21, 1.6, cz, matTrim, Math.PI / 2);
    vplane(0.95, 1.05, cx + 3.23, 1.6, cz, matDark, Math.PI / 2);
    // Parapet lip around the roofline (roof slab top is y 3.3; the lip sits
    // above it, so it is the one detail piece added to `shootables`).
    const roofD = d + 0.4;
    vbox(6.4, 0.35, 0.12, cx, 3.475, cz - (roofD / 2 - 0.06), matConcreteDark, 0, true);
    vbox(6.4, 0.35, 0.12, cx, 3.475, cz + (roofD / 2 - 0.06), matConcreteDark, 0, true);
    vbox(0.12, 0.35, roofD - 0.24, cx - 3.14, 3.475, cz, matConcreteDark, 0, true);
    vbox(0.12, 0.35, roofD - 0.24, cx + 3.14, 3.475, cz, matConcreteDark, 0, true);
    // Vent pipe with cap, and an AC box with a dark grille, on the roof.
    vcyl(0.12, 0.12, 0.55, cx + 2.3, 3.58, cz + roofD / 2 - 0.8, matMetal);
    vbox(0.34, 0.06, 0.34, cx + 2.3, 3.88, cz + roofD / 2 - 0.8, matMetal);
    vbox(0.9, 0.45, 0.7, cx - 1.9, 3.53, cz - roofD / 2 + 0.9, matMetal);
    vplane(0.6, 0.25, cx - 1.9, 3.53, cz - roofD / 2 + 0.9 + 0.36, matDark, 0);
    // Sandbag / crate prop against the door wall, clear of the doorway.
    const pz = doorZ + out * 0.62;
    if (prop === 'crate') vbox(1.2, 1.2, 1.2, cx + 2.2, 0.6, pz, matCrate, 0.12);
    else vbox(1.4, 0.55, 0.7, cx + 2.2, 0.28, pz, matSandbag);
  }
  detailHouse(-24, 12, 5, 'S', 'sandbag'); // WORKSHOP (corrugated)
  detailHouse(24, 12, 5, 'S', 'crate'); // STOREHOUSE (teal corrugated)
  detailHouse(0, 20, 4, 'S', 'sandbag'); // MESS HALL

  // Refinery hall detail: lintels + frames on both doorways, clerestory windows
  // high on the north wall, windows on the west wall, parapet lip, vent pipes
  // and an exhaust stack on the roof, rust streaks, and the hall sign plate.
  // East doorway (faces mid).
  vbox(0.14, 0.3, 2.0, -12.72, 2.55, -9, matTrim);
  vbox(0.12, 2.4, 0.14, -12.72, 1.2, -10.07, matTrim);
  vbox(0.12, 2.4, 0.14, -12.72, 1.2, -7.93, matTrim);
  vbox(0.6, 0.06, 1.7, -12.6, 0.03, -9, matDark);
  // South doorway.
  vbox(2.0, 0.3, 0.14, -18, 2.55, -2.72, matTrim);
  vbox(0.14, 2.4, 0.12, -18.87, 1.2, -2.72, matTrim);
  vbox(0.14, 2.4, 0.12, -17.13, 1.2, -2.72, matTrim);
  vbox(1.7, 0.06, 0.6, -18, 0.03, -2.6, matDark);
  // Clerestory windows, north wall exterior (face -z).
  for (const wx of [-24, -20, -16]) {
    vplane(1.15, 1.25, wx, 3.2, -15.28, matTrim, Math.PI);
    vplane(0.95, 1.05, wx, 3.2, -15.31, matDark, Math.PI);
  }
  // Windows, west wall exterior (face -x).
  for (const wz of [-12, -6]) {
    vplane(1.15, 1.25, -27.28, 2.2, wz, matTrim, -Math.PI / 2);
    vplane(0.95, 1.05, -27.31, 2.2, wz, matDark, -Math.PI / 2);
  }
  // Rust streaks down the east and south faces.
  vplane(1.2, 1.6, -12.76, 1.2, -12, matRust, Math.PI / 2);
  vplane(0.9, 1.1, -12.76, 0.8, -5, matRust, Math.PI / 2);
  vplane(1.4, 1.4, -23, 1.0, -2.76, matRust, Math.PI);
  // Parapet lip around the hall roof (roof slab top y 4.8; shootable lip).
  vbox(14.6, 0.35, 0.12, -20, 4.975, -15.24, matConcreteDark, 0, true);
  vbox(14.6, 0.35, 0.12, -20, 4.975, -2.76, matConcreteDark, 0, true);
  vbox(0.12, 0.35, 12.36, -27.24, 4.975, -9, matConcreteDark, 0, true);
  vbox(0.12, 0.35, 12.36, -12.76, 4.975, -9, matConcreteDark, 0, true);
  // Roof vents + exhaust stack.
  vcyl(0.14, 0.14, 0.7, -24, 5.15, -12, matPipe);
  vbox(0.4, 0.06, 0.4, -24, 5.53, -12, matMetal);
  vcyl(0.14, 0.14, 0.7, -17, 5.15, -6, matPipe);
  vbox(0.4, 0.06, 0.4, -17, 5.53, -6, matMetal);
  vcyl(0.5, 0.6, 1.6, -15, 5.6, -6, matPipe);
  vbox(1.2, 0.08, 1.2, -15, 6.44, -6, matMetal);
  // Horizontal pipe run inside, high along the north wall.
  const pipeRun1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 12, 10), matPipe);
  pipeRun1.rotation.z = Math.PI / 2;
  pipeRun1.position.set(-20, 3.2, -14.3);
  pipeRun1.castShadow = true;
  group.add(pipeRun1);
  const pipeRun2 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 12, 10), matPipe);
  pipeRun2.rotation.z = Math.PI / 2;
  pipeRun2.position.set(-20, 2.9, -14.3);
  pipeRun2.castShadow = true;
  group.add(pipeRun2);

  // Unit-marking sign plates.
  const matPlateHall = new THREE.MeshStandardMaterial({ map: Textures.plateTexture('REFINERY HALL', 'UNIT 01'), roughness: 0.7, metalness: 0.2 });
  const matPlateCourt = new THREE.MeshStandardMaterial({ map: Textures.plateTexture('PUMP COURT', 'WELLHEAD ROW'), roughness: 0.7, metalness: 0.2 });
  const matPlateShop = new THREE.MeshStandardMaterial({ map: Textures.plateTexture('WORKSHOP', 'MAINTENANCE'), roughness: 0.7, metalness: 0.2 });
  const matPlateStore = new THREE.MeshStandardMaterial({ map: Textures.plateTexture('STOREHOUSE', 'SUPPLY'), roughness: 0.7, metalness: 0.2 });
  const matPlateMess = new THREE.MeshStandardMaterial({ map: Textures.plateTexture('MESS HALL', 'CREW'), roughness: 0.7, metalness: 0.2 });
  vplane(3.4, 1.7, -12.72, 3.4, -9, matPlateHall, Math.PI / 2);
  vplane(3.4, 1.7, 19, 1.8, -15.35, matPlateCourt, Math.PI);
  vplane(2.6, 1.3, -24, 2.0, 9.28, matPlateShop, Math.PI);
  vplane(2.6, 1.3, 24, 2.0, 9.28, matPlateStore, Math.PI);
  vplane(2.6, 1.3, 0, 2.0, 17.78, matPlateMess, Math.PI);

  // Pump court detail: cap stones on the walls, rust streaks, sandbags at the
  // west entrance corners.
  for (const wz of [-15, -1]) {
    vbox(14.4, 0.14, 0.9, 19, 2.67, wz, matSandstoneDark);
  }
  vbox(0.9, 0.14, 12.4, 26, 2.67, -8, matSandstoneDark);
  vplane(1.2, 1.0, 14, 1.2, -15.32, matRust, Math.PI);
  vplane(1.0, 1.3, 23, 1.1, -15.32, matRust, Math.PI);
  vbox(1.4, 0.55, 0.7, 12.6, 0.28, -2.2, matSandbag);
  vbox(1.4, 0.55, 0.7, 12.6, 0.28, -13.8, matSandbag);

  // Pumpjacks: base + A-frame + walking beam + horse head + counterweight.
  function pumpjack(px, pz, rotY) {
    const g = new THREE.Group();
    g.position.set(px, 0, pz);
    g.rotation.y = rotY;
    group.add(g);
    function pbox(w, h, d, x, y, z, material, rz = 0) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      m.position.set(x, y, z);
      m.rotation.z = rz;
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      return m;
    }
    pbox(2.4, 0.35, 1.2, 0, 0.18, 0, matMetal); // skid base
    pbox(0.22, 2.0, 0.22, -0.2, 1.2, 0.45, matPipe, 0.18); // A-frame leg
    pbox(0.22, 2.0, 0.22, -0.2, 1.2, -0.45, matPipe, 0.18);
    pbox(0.22, 2.0, 0.22, 0.3, 1.2, 0.45, matPipe, -0.18);
    pbox(0.22, 2.0, 0.22, 0.3, 1.2, -0.45, matPipe, -0.18);
    pbox(3.4, 0.32, 0.45, 0.1, 2.35, 0, matMetal, 0.16); // walking beam, head end down
    pbox(0.7, 0.9, 0.45, 1.75, 2.0, 0, matMetal); // horse head
    pbox(0.8, 0.9, 0.6, -1.5, 2.1, 0, matRust); // counterweight
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8), matPipe);
    rod.position.set(1.75, 1.2, 0);
    rod.castShadow = true;
    g.add(rod);
  }
  pumpjack(16, -11, 0.25);
  pumpjack(21, -5.5, -0.35);

  // Cable spools: big discs on their side with an axle.
  function spool(sx, sz) {
    const discGeo = new THREE.CylinderGeometry(1.05, 1.05, 0.1, 18);
    for (const dz of [-0.35, 0.35]) {
      const disc = new THREE.Mesh(discGeo, matCrate);
      disc.rotation.x = Math.PI / 2;
      disc.position.set(sx, 0.9, sz + dz);
      disc.castShadow = true;
      disc.receiveShadow = true;
      group.add(disc);
    }
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.7, 14), matPipe);
    core.rotation.x = Math.PI / 2;
    core.position.set(sx, 0.9, sz);
    core.castShadow = true;
    group.add(core);
  }
  spool(23.5, -3.5);
  spool(-23.5, -3.5);

  // Elevated pipe rack pipes (visual; posts collide, pipes are above head height).
  for (const [py, pr] of [[2.6, 0.28], [2.9, 0.22]]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, 8, 12), matPipe);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(-9, py, -13.5);
    pipe.castShadow = true;
    group.add(pipe);
  }
  // Valve wheel on the rack.
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 14), matFlare);
  wheel.rotation.x = Math.PI / 2;
  wheel.position.set(-8, 1.3, -13.2);
  wheel.castShadow = true;
  group.add(wheel);
  vcyl(0.06, 0.06, 0.5, -8, 1.0, -13.2, matPipe);

  // Tank detail: ladder rails + rungs, top rim.
  function detailTank(tx, tz, r, h) {
    const lx = tx + r + 0.18;
    vbox(0.06, h, 0.06, lx, h / 2, tz - 0.25, matMetal);
    vbox(0.06, h, 0.06, lx, h / 2, tz + 0.25, matMetal);
    for (let y = 0.6; y < h - 0.3; y += 0.6) vbox(0.05, 0.05, 0.5, lx, y, tz, matMetal);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.08, r + 0.08, 0.16, 20), matMetal);
    rim.position.set(tx, h + 0.08, tz);
    rim.castShadow = true;
    group.add(rim);
  }
  detailTank(-29.5, -12, 2.0, 5);
  detailTank(-29.5, -18, 2.0, 5);
  detailTank(-22, -21.5, 1.6, 4);
  detailTank(-25, -5, 1.5, 3);

  // Flare stack: flame cone + warm point light at the top.
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 10), matFlare);
  flame.position.set(-29.5, 14.2, -21.5);
  group.add(flame);
  const flareLight = new THREE.PointLight(new THREE.Color('#ff7a2a'), 20, 18, 1.6);
  flareLight.position.set(-29.5, 14.5, -21.5);
  scene.add(flareLight);
  // Platform ring on the stack.
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 12), matMetal);
  ring.position.set(-29.5, 9, -21.5);
  ring.castShadow = true;
  group.add(ring);

  // Watchtower detail: roof on posts, ladder on the south face, sandbags and a
  // lamp on the platform.
  for (const [lx, lz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) {
    vbox(0.15, 1.0, 0.15, lx, 4.2, lz, matMetal);
  }
  vbox(4.2, 0.12, 4.2, 0, 4.75, 0, matConcreteDark);
  vbox(0.08, 3.4, 0.08, -0.3, 1.7, 1.85, matMetal);
  vbox(0.08, 3.4, 0.08, 0.3, 1.7, 1.85, matMetal);
  for (let y = 0.5; y < 3.4; y += 0.5) vbox(0.6, 0.06, 0.06, 0, y, 1.85, matMetal);
  vbox(1.2, 0.4, 0.5, 0, 3.9, 1.5, matSandbag);
  vbox(0.3, 0.25, 0.3, 0, 4.35, 0, matAccent);
  const towerLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 6, 9, 1.6);
  towerLight.position.set(0, 4.2, 0);
  scene.add(towerLight);

  // Containers: corrugated ribs + top rail on both long faces, rust streaks
  // on the rust-painted ones.
  function detailContainer(cx, cz, rust) {
    for (const side of [-1, 1]) {
      const fz = cz + side * 1.2;
      for (let i = 0; i < 6; i++) {
        vbox(0.1, 2.3, 0.06, cx - 2.2 + i * 0.88, 1.3, fz + side * 0.03, matMetal);
      }
      vbox(5.5, 0.12, 0.08, cx, 2.52, fz + side * 0.03, matMetal);
    }
    if (rust) {
      vplane(1.4, 0.55, cx - 1.2, 0.4, cz - 1.23, matRust, Math.PI);
      vplane(0.9, 0.8, cx + 1.6, 0.9, cz + 1.23, matRust, 0);
    }
  }
  detailContainer(-28, 2, true);
  detailContainer(28, 2, false);
  detailContainer(-10, -20, false);
  detailContainer(10, -20, true);
  detailContainer(-16, 22, true);
  detailContainer(16, 22, false);

  // Tarps draped over crate stacks (slightly rotated, sagging look).
  const tarpA = vbox(2.0, 0.08, 2.0, -23.9, 2.5, -11, matTarpGreen, 0.18);
  tarpA.rotation.z = 0.08;
  const tarpB = vbox(1.5, 0.08, 1.5, 0, 1.28, -6, matTarpGreen, 0.3);
  tarpB.rotation.z = -0.05;
  const tarpC = vbox(1.5, 0.08, 1.5, 12, 1.28, -6, matTarpTan, -0.12);
  tarpC.rotation.x = -0.06;

  // Camouflage netting draped over sandbag lines (semi-transparent, sagging).
  const netMid = vplane(6.4, 3.4, 0, 1.17, 7, matCamo, 0);
  netMid.rotation.x = -Math.PI / 2 + 0.05;
  netMid.rotation.z = 0.04;
  const netMidSide = vplane(6.4, 1.0, 0, 0.62, 8.56, matCamo, 0);
  netMidSide.rotation.x = 0.08;
  const netW = vplane(4.4, 1.2, -10, 1.16, 8, matCamo, 0);
  netW.rotation.x = -Math.PI / 2 + 0.04;
  netW.rotation.z = -0.05;

  // Battle damage: a dark crack plane + a slab leaning on the hall east wall,
  // and rubble piles at the base of the hall west wall and the court north wall.
  vplane(0.5, 1.2, -12.72, 1.8, -12, matDark, Math.PI / 2);
  const slab = vbox(0.08, 1.5, 0.6, -12.5, 0.75, -12.2, matConcreteDark, 0);
  slab.rotation.z = 0.28;
  rock(-27.5, -5.5, 0.4, matRockDark, 0.4, 0.2);
  rock(-27.8, -4.8, 0.3, matRock, 1.2, -0.15);
  rock(-27.4, -4.3, 0.24, matRockDark, 2.1, 0.1);
  rock(-27.7, -6.0, 0.28, matRock, 0.8, 0.25);
  rock(25.5, -14, 0.36, matRock, 0.9, -0.2);
  rock(25.8, -13.2, 0.26, matRockDark, 2.4, 0.15);
  rock(25.3, -13.6, 0.22, matRock, 1.7, -0.1);

  // Oil stains on the ground near the refinery (hall interior + tank farm).
  for (const [ox, oz, ow, oh] of [[-22, -12, 4, 3], [-16, -6, 3.5, 2.5], [-26, -16.5, 4, 3], [-20, -19.5, 3, 2.5]]) {
    const stain = new THREE.Mesh(new THREE.PlaneGeometry(ow, oh), matOil);
    stain.rotation.x = -Math.PI / 2;
    stain.position.set(ox, 0.02, oz);
    group.add(stain);
  }

  // Scattered rocks/debris: seeded, half-buried, kept clear of waypoints,
  // loot spots, drop points (>= 1.5m) and collider footprints (>= 1.0m).
  const rDetail = rngDetail(2026);
  function clearOfPoints(x, z) {
    for (const [wx, wz] of WAYPOINTS) if ((wx - x) ** 2 + (wz - z) ** 2 < 1.5 ** 2) return false;
    for (const p of MAP.lootSpots) if ((p.x - x) ** 2 + (p.z - z) ** 2 < 1.5 ** 2) return false;
    for (const p of MAP.dropPoints) if ((p.x - x) ** 2 + (p.z - z) ** 2 < 1.5 ** 2) return false;
    for (const c of colliders) {
      if (c.max.y <= 0) continue;
      const dx = Math.max(c.min.x - x, 0, x - c.max.x);
      const dz = Math.max(c.min.z - z, 0, z - c.max.z);
      if (dx * dx + dz * dz < 1.0 ** 2) return false;
    }
    return true;
  }
  let rocksPlaced = 0;
  for (let tries = 0; tries < 80 && rocksPlaced < 14; tries++) {
    const x = -30 + rDetail() * 60;
    const z = -22 + rDetail() * 44;
    if (!clearOfPoints(x, z)) continue;
    rock(x, z, 0.25 + rDetail() * 0.35, rDetail() < 0.5 ? matRock : matRockDark, rDetail() * Math.PI * 2, (rDetail() - 0.5) * 0.5);
    rocksPlaced++;
  }

  // Site decals: a big letter on the ground at each site landmark.
  for (const [letter, site] of [['A', MAP.sites.A], ['B', MAP.sites.B]]) {
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 5),
      new THREE.MeshBasicMaterial({ map: Textures.siteTexture(letter), transparent: true, depthWrite: false }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(site.x, 0.02, site.z);
    group.add(decal);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), matAccent);
    post.position.set(site.x, 1.3, site.z - 3.2);
    post.castShadow = true;
    group.add(post);
  }

  // Sky dome: a gradient sphere, back side, so the horizon glows amber at dusk.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(150, 24, 16),
    new THREE.MeshBasicMaterial({ map: Textures.skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  // Warm horizon glow toward the low sun (west): two additive radial-gradient
  // planes just inside the sky dome, unfogged so they read at dusk.
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 256; glowCanvas.height = 128;
  const gctx = glowCanvas.getContext('2d');
  const grad = gctx.createRadialGradient(128, 64, 4, 128, 64, 120);
  grad.addColorStop(0, 'rgba(255,205,130,0.9)');
  grad.addColorStop(0.4, 'rgba(255,160,80,0.45)');
  grad.addColorStop(1, 'rgba(255,150,70,0)');
  gctx.fillStyle = grad;
  gctx.fillRect(0, 0, 256, 128);
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(110, 44),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  glow.position.set(-120, 15, 18);
  glow.rotation.y = Math.PI / 2;
  scene.add(glow);
  const glowCore = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 16),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  glowCore.position.set(-124, 18, 14);
  glowCore.rotation.y = Math.PI / 2;
  scene.add(glowCore);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 120);

  // Light: a low warm sun from the west, a cool fill from the east, a sky/ground gradient.
  const hemi = new THREE.HemisphereLight(new THREE.Color('#6f87a3'), new THREE.Color(PALETTE.sandDark), 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ff9e45'), 3.0);
  sun.position.set(-34, 20, 12);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -36;
  sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 36;
  sun.shadow.camera.bottom = -36;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 110;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5a6b7a'), 0.55);
  fill.position.set(18, 12, 14);
  scene.add(fill);
  // Warm lamps over the two sites.
  for (const site of [MAP.sites.A, MAP.sites.B]) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 14, 14, 1.6);
    lamp.position.set(site.x, 3.4, site.z);
    scene.add(lamp);
  }

  // Waypoint graph: nodes are open ground; edges join pairs close enough with a clear
  // straight line (sampled against the colliders with a small clearance).
  const nodes = WAYPOINTS.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const edges = nodes.map(() => []);
  const probe = new THREE.Box3();
  function clearLine(a, b) {
    const steps = Math.ceil(a.distanceTo(b) / 0.4);
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      probe.min.set(x - 0.38, 0.1, z - 0.38);
      probe.max.set(x + 0.38, 1.6, z + 0.38);
      for (const c of colliders) if (probe.intersectsBox(c)) return false;
    }
    return true;
  }
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (nodes[i].distanceTo(nodes[j]) > 13) continue;
      if (!clearLine(nodes[i], nodes[j])) continue;
      edges[i].push(j);
      edges[j].push(i);
    }
  }
  function nearestNode(p) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const d = (nodes[i].x - p.x) ** 2 + (nodes[i].z - p.z) ** 2;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }
  function findPath(from, to) {
    const start = nearestNode(from);
    const goal = nearestNode(to);
    if (start === goal) return [nodes[goal].clone()];
    const prev = new Array(nodes.length).fill(-1);
    const queue = [start];
    prev[start] = start;
    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur === goal) break;
      for (const next of edges[cur]) {
        if (prev[next] !== -1) continue;
        prev[next] = cur;
        queue.push(next);
      }
    }
    if (prev[goal] === -1) return [nodes[goal].clone()];
    const path = [];
    let cur = goal;
    while (cur !== start) {
      path.unshift(nodes[cur].clone());
      cur = prev[cur];
    }
    return path;
  }

  return { colliders, shootables, group, nodes, edges, nearestNode, findPath };
}
