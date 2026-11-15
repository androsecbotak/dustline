// The map: DUSTLINE, a 64x48m desert outpost at dusk, now a battle-royale arena.
// Sites A (west) and B (east) are kept as named landmarks / loot areas, not bomb
// sites. Six house-like structures, container yards, crate clusters, sandbag lines
// and barrels spread cover across the whole map so no large area is empty.
// Vanguard spawn south, Crimson spawn north (kept for compatibility; v2 uses the
// 12 dropPoints instead). Waypoints feed the bots' pathfinding.
// Every box is a collider for players and bots and a surface a bullet stops on.
// Textures are procedural (textures.js); the sky is a gradient sphere; the sun is low
// and warm so shadows run long.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import * as Textures from './textures.js';

export const MAP = {
  minX: -32, maxX: 32, minZ: -24, maxZ: 24,
  sites: {
    A: new THREE.Vector3(-16, 0, -10),
    B: new THREE.Vector3(16, 0, -10),
  },
  spawns: {
    vanguard: [new THREE.Vector3(-6, 0, 15), new THREE.Vector3(0, 0, 15), new THREE.Vector3(6, 0, 15)],
    crimson: [new THREE.Vector3(-6, 0, -15), new THREE.Vector3(0, 0, -15), new THREE.Vector3(6, 0, -15)],
  },
  // Loot spots: open ground, at least 2m from any collider, spread across the map.
  lootSpots: [
    { x: -21, z: -10 }, { x: 21, z: -10 },
    { x: -8, z: 0 }, { x: 8, z: 0 },
    { x: -26, z: -10 }, { x: 26, z: -10 },
    { x: -6, z: 17 }, { x: 6, z: 17 },
    { x: -22, z: 4 }, { x: 22, z: 4 },
    { x: -16, z: 16 }, { x: 16, z: 16 },
    { x: -16, z: -21 }, { x: 16, z: -21 },
    { x: -29, z: 16 }, { x: 29, z: 16 },
    { x: -26, z: -12 }, { x: 26, z: -12 },
  ],
  // Drop points: exactly 12, spread across the map, at least 3m apart from each
  // other, on open ground clear of colliders.
  dropPoints: [
    { x: -28, z: 20 }, { x: 28, z: 20 },
    { x: -28, z: -4 }, { x: 28, z: -4 },
    { x: -14, z: 10 }, { x: 14, z: 10 },
    { x: -16, z: -18 }, { x: 16, z: -18 },
    { x: -4, z: -8 }, { x: 4, z: -8 },
    { x: -18, z: 16 }, { x: 18, z: 16 },
  ],
};

const WAYPOINTS = [
  // South row (z -20) — nudged around the SW/SE houses and the south containers.
  [-30, -20], [-20, -20], [-14, -20], [-4, -20], [4, -20], [14, -20], [20, -20], [30, -20],
  // z -12 row.
  [-28, -12], [-20, -12], [-13, -12], [-6, -12], [6, -12], [13, -12], [20, -12], [28, -12],
  // z -4 row.
  [-28, -4], [-20, -4], [-12, -4], [-5, -4], [5, -4], [12, -4], [20, -4], [28, -4],
  // z +4/+5 row — nudged off the west/east containers.
  [-28, 5], [-20, 4], [-12, 4], [-4, 4], [4, 4], [12, 4], [20, 4], [28, 5],
  // z +12 row — nudged off the NW/NE house walls.
  [-29, 12], [-19, 12], [-12, 12], [-4, 12], [4, 12], [12, 12], [19, 12], [29, 12],
  // North row (z +20) — nudged around the north houses and containers.
  [-28, 20], [-20, 20], [-12, 20], [-5, 20], [5, 20], [12, 20], [20, 20], [28, 20],
  // Sites A and B.
  [-16, -10], [16, -10],
  // Spawn points (kept from the old map so the spawn lanes stay pathed).
  [-6, 15], [0, 15], [6, 15],
  [-6, -15], [0, -15], [6, -15],
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

  const matSand = new THREE.MeshStandardMaterial({ map: sand, roughness: 0.96, metalness: 0 });
  const matConcrete = new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.92, metalness: 0.02 });
  const matConcreteDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.concreteDark), roughness: 0.9, metalness: 0.02 });
  const matContainer = new THREE.MeshStandardMaterial({ map: containerTex, roughness: 0.75, metalness: 0.25 });
  const matContainerRust = new THREE.MeshStandardMaterial({ map: containerRustTex, roughness: 0.8, metalness: 0.2 });
  const matCrate = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.85, metalness: 0 });
  const matSandbag = new THREE.MeshStandardMaterial({ map: sandbagTex, roughness: 0.98, metalness: 0 });
  const matMetal = new THREE.MeshStandardMaterial({ map: metalTex, roughness: 0.55, metalness: 0.5 });
  const matAccent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.6, metalness: 0.1, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.25 });

  // ---- Visual-detail materials (detail pass only; nothing here collides) ----
  const matDark = new THREE.MeshStandardMaterial({ color: 0x241c14, roughness: 1, metalness: 0 });
  const matTrim = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.concreteDark), roughness: 0.9, metalness: 0.02 });
  const matRust = new THREE.MeshStandardMaterial({ color: 0x5e3a22, roughness: 0.95, metalness: 0.05 });
  const matTarpGreen = new THREE.MeshStandardMaterial({ color: 0x5a6350, roughness: 0.95, metalness: 0 });
  const matTarpTan = new THREE.MeshStandardMaterial({ color: 0xa8895a, roughness: 0.95, metalness: 0 });
  const matCamo = new THREE.MeshStandardMaterial({ color: 0x2e3d24, roughness: 1, metalness: 0, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const matRock = new THREE.MeshStandardMaterial({ color: 0x5d5142, roughness: 1, metalness: 0 });
  const matRockDark = new THREE.MeshStandardMaterial({ color: 0x463c2e, roughness: 1, metalness: 0 });

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

  // Ground and perimeter.
  box(64.6, 0.4, 48.6, 0, -0.2, 0, matSand);
  box(64.6, 4.2, 0.6, 0, 2.1, -24.3, matConcrete);
  box(64.6, 4.2, 0.6, 0, 2.1, 24.3, matConcrete);
  box(0.6, 4.2, 48.6, -32.3, 2.1, 0, matConcrete);
  box(0.6, 4.2, 48.6, 32.3, 2.1, 0, matConcrete);

  // Site A (west): container, crate stack, sandbag wall, two wall segments with a gap.
  box(5.5, 2.6, 2.4, -16, 1.3, -13.5, matContainer);
  box(1.2, 1.2, 1.2, -18.5, 0.6, -8, matCrate);
  box(1.2, 1.2, 1.2, -17.2, 0.6, -8, matCrate);
  box(1.2, 1.2, 1.2, -17.8, 1.8, -8, matCrate);
  box(4, 1.1, 0.8, -13, 0.55, -7.5, matSandbag);
  box(0.5, 3, 4, -11, 1.5, -14, matConcreteDark);
  box(0.5, 3, 4, -11, 1.5, -6, matConcreteDark);
  // Site B (east): mirror of A.
  box(5.5, 2.6, 2.4, 16, 1.3, -13.5, matContainerRust);
  box(1.2, 1.2, 1.2, 18.5, 0.6, -8, matCrate);
  box(1.2, 1.2, 1.2, 17.2, 0.6, -8, matCrate);
  box(1.2, 1.2, 1.2, 17.8, 1.8, -8, matCrate);
  box(4, 1.1, 0.8, 13, 0.55, -7.5, matSandbag);
  box(0.5, 3, 4, 11, 1.5, -14, matConcreteDark);
  box(0.5, 3, 4, 11, 1.5, -6, matConcreteDark);

  // Mid: a chest-high block to shoot over, a tall block that breaks the long sightline.
  box(6, 1.1, 3, 0, 0.55, 2, matSandbag);
  box(3, 2.4, 3, 0, 1.2, -4, matConcreteDark);
  box(1.2, 1.2, 1.2, -3, 0.6, -3, matCrate);
  box(1.2, 1.2, 1.2, 3, 0.6, -3, matCrate);
  box(1.2, 1.2, 1.2, 0, 0.6, -6, matCrate);
  // Watchtower (decorative, blocks movement): four legs and a platform with a rail.
  for (const [lx, lz] of [[-1.5, -11.5], [1.5, -11.5], [-1.5, -14.5], [1.5, -14.5]]) {
    box(0.35, 3.4, 0.35, lx, 1.7, lz, matMetal);
  }
  box(3.6, 0.3, 3.6, 0, 3.55, -13, matMetal);
  box(3.6, 0.7, 0.15, 0, 4.05, -11.2, matMetal);
  box(3.6, 0.7, 0.15, 0, 4.05, -14.8, matMetal);

  // Spawn cover: kept clear of the spawn points themselves, so a bot never spawns
  // inside a crate and the lane from spawn to mid stays open.
  box(1.2, 1.2, 1.2, -9, 0.6, 12, matCrate);
  box(1.2, 1.2, 1.2, 9, 0.6, 12, matCrate);
  box(1.2, 1.2, 1.2, 0, 0.6, 10, matCrate);
  box(3, 1.1, 0.8, 0, 0.55, 13, matSandbag);
  box(1.2, 1.2, 1.2, -9, 0.6, -13, matCrate);
  box(1.2, 1.2, 1.2, 9, 0.6, -13, matCrate);
  // Lane crates.
  box(1.2, 1.2, 1.2, -19, 0.6, 6, matCrate);
  box(1.2, 1.2, 1.2, -19, 0.6, -2, matCrate);
  box(1.2, 1.2, 1.2, 19, 0.6, 6, matCrate);
  box(1.2, 1.2, 1.2, 19, 0.6, -2, matCrate);
  box(1.2, 1.2, 1.2, -19, 0.6, 0, matCrate);
  box(1.2, 1.2, 1.2, 19, 0.6, 0, matCrate);

  // Houses: 4 walls (0.4 thick, 3 high) with a 1.6m doorway gap in one wall,
  // plus a roof slab. Interiors are open ground but are NOT waypoints — bots
  // path around them; the doorway is wide enough for a player to enter.
  // House H1 (NW): footprint x -27..-21, z 9.5..14.5, doorway in the south wall.
  box(6, 3, 0.4, -24, 1.5, 14.5, matConcrete);
  box(2.2, 3, 0.4, -25.9, 1.5, 9.5, matConcrete);
  box(2.2, 3, 0.4, -22.1, 1.5, 9.5, matConcrete);
  box(0.4, 3, 5, -27, 1.5, 12, matConcrete);
  box(0.4, 3, 5, -21, 1.5, 12, matConcrete);
  box(6.4, 0.3, 5.4, -24, 3.15, 12, matConcreteDark);
  // House H2 (NE): footprint x 21..27, z 9.5..14.5, doorway in the south wall.
  box(6, 3, 0.4, 24, 1.5, 14.5, matConcrete);
  box(2.2, 3, 0.4, 22.1, 1.5, 9.5, matConcrete);
  box(2.2, 3, 0.4, 25.9, 1.5, 9.5, matConcrete);
  box(0.4, 3, 5, 21, 1.5, 12, matConcrete);
  box(0.4, 3, 5, 27, 1.5, 12, matConcrete);
  box(6.4, 0.3, 5.4, 24, 3.15, 12, matConcreteDark);
  // House H3 (SW): footprint x -28..-22, z -20..-15, doorway in the north wall.
  box(6, 3, 0.4, -25, 1.5, -20, matConcrete);
  box(2.2, 3, 0.4, -26.9, 1.5, -15, matConcrete);
  box(2.2, 3, 0.4, -23.1, 1.5, -15, matConcrete);
  box(0.4, 3, 5, -28, 1.5, -17.5, matConcrete);
  box(0.4, 3, 5, -22, 1.5, -17.5, matConcrete);
  box(6.4, 0.3, 5.4, -25, 3.15, -17.5, matConcreteDark);
  // House H4 (SE): footprint x 22..28, z -20..-15, doorway in the north wall.
  box(6, 3, 0.4, 25, 1.5, -20, matConcrete);
  box(2.2, 3, 0.4, 23.1, 1.5, -15, matConcrete);
  box(2.2, 3, 0.4, 26.9, 1.5, -15, matConcrete);
  box(0.4, 3, 5, 22, 1.5, -17.5, matConcrete);
  box(0.4, 3, 5, 28, 1.5, -17.5, matConcrete);
  box(6.4, 0.3, 5.4, 25, 3.15, -17.5, matConcreteDark);
  // House H5 (north centre): footprint x -3..3, z 18..22, doorway in the south wall.
  box(6, 3, 0.4, 0, 1.5, 22, matConcrete);
  box(2.2, 3, 0.4, -1.9, 1.5, 18, matConcrete);
  box(2.2, 3, 0.4, 1.9, 1.5, 18, matConcrete);
  box(0.4, 3, 4, -3, 1.5, 20, matConcrete);
  box(0.4, 3, 4, 3, 1.5, 20, matConcrete);
  box(6.4, 0.3, 4.4, 0, 3.15, 20, matConcreteDark);
  // House H6 (south centre): footprint x -3..3, z -22..-18, doorway in the north wall.
  box(6, 3, 0.4, 0, 1.5, -22, matConcrete);
  box(2.2, 3, 0.4, -1.9, 1.5, -18, matConcrete);
  box(2.2, 3, 0.4, 1.9, 1.5, -18, matConcrete);
  box(0.4, 3, 4, -3, 1.5, -20, matConcrete);
  box(0.4, 3, 4, 3, 1.5, -20, matConcrete);
  box(6.4, 0.3, 4.4, 0, 3.15, -20, matConcreteDark);

  // Container yards (new): west/east mid containers, south pair, north pair.
  box(5.5, 2.6, 2.4, -28, 1.3, 2, matContainerRust);
  box(5.5, 2.6, 2.4, 28, 1.3, 2, matContainer);
  box(5.5, 2.6, 2.4, -10, 1.3, -20, matContainer);
  box(5.5, 2.6, 2.4, 10, 1.3, -20, matContainerRust);
  box(5.5, 2.6, 2.4, -16, 1.3, 22, matContainerRust);
  box(5.5, 2.6, 2.4, 16, 1.3, 22, matContainer);

  // Extra crates spread across the map.
  box(1.2, 1.2, 1.2, -12, 0.6, 6, matCrate);
  box(1.2, 1.2, 1.2, 12, 0.6, 6, matCrate);
  box(1.2, 1.2, 1.2, -12, 0.6, -6, matCrate);
  box(1.2, 1.2, 1.2, 12, 0.6, -6, matCrate);
  box(1.2, 1.2, 1.2, -24, 0.6, -2, matCrate);
  box(1.2, 1.2, 1.2, 24, 0.6, -2, matCrate);
  box(1.2, 1.2, 1.2, -7, 0.6, 20, matCrate);
  box(1.2, 1.2, 1.2, 7, 0.6, 20, matCrate);
  box(1.2, 1.2, 1.2, -30, 0.6, -8, matCrate);
  box(1.2, 1.2, 1.2, 30, 0.6, -8, matCrate);
  box(1.2, 1.2, 1.2, -30, 0.6, 8, matCrate);
  box(1.2, 1.2, 1.2, 30, 0.6, 8, matCrate);
  box(1.2, 1.2, 1.2, -30, 0.6, -14, matCrate);
  box(1.2, 1.2, 1.2, 30, 0.6, -14, matCrate);

  // Extra sandbag lines.
  box(4, 1.1, 0.8, -10, 0.55, 8, matSandbag);
  box(4, 1.1, 0.8, 10, 0.55, 8, matSandbag);
  box(4, 1.1, 0.8, -10, 0.55, -18, matSandbag);
  box(4, 1.1, 0.8, 10, 0.55, -18, matSandbag);
  box(4, 1.1, 0.8, -10, 0.55, 18, matSandbag);
  box(4, 1.1, 0.8, 10, 0.55, 18, matSandbag);

  // Barrels (cylinders, collided as boxes).
  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 14);
  for (const [bx, bz] of [[-8, 4], [8, 4], [-14, 2], [14, 2], [-4, -12], [4, -12], [-26, 6], [26, 6], [-26, -6], [26, -6], [-12, 16], [12, 16], [-12, -16], [12, -16]]) {
    const barrel = new THREE.Mesh(barrelGeo, matMetal);
    barrel.position.set(bx, 0.55, bz);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    group.add(barrel);
    colliders.push(new THREE.Box3(new THREE.Vector3(bx - 0.45, 0, bz - 0.45), new THREE.Vector3(bx + 0.45, 1.1, bz + 0.45)));
    shootables.push(barrel);
  }

  // ---- Visual detail pass: military/desert dressing, visual only. ----
  // No collider, waypoint, lootSpot or dropPoint is touched here; every mesh
  // below is decoration except the roof parapets (shootable, above the roof
  // collider). All prop positions were checked >= 1.5m from waypoints, loot
  // spots and drop points; the rock scatter filters for that at runtime.

  // Houses: doorway lintel + frame strips + threshold, a faded unit-marking
  // plate beside the door, dark window recesses with trim on the solid walls,
  // a parapet lip around the roofline, a vent pipe, an AC box, and a sandbag
  // or crate prop against the door wall.
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
  detailHouse(-24, 12, 5, 'S', 'sandbag'); // H1 NW
  detailHouse(24, 12, 5, 'S', 'crate'); // H2 NE
  detailHouse(-25, -17.5, 5, 'N', 'sandbag'); // H3 SW
  detailHouse(25, -17.5, 5, 'N', 'crate'); // H4 SE
  detailHouse(0, 20, 4, 'S', 'sandbag'); // H5 north centre
  detailHouse(0, -20, 4, 'N', 'sandbag'); // H6 south centre

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
  detailContainer(-16, -13.5, false); // Site A
  detailContainer(16, -13.5, true); // Site B
  detailContainer(-28, 2, true);
  detailContainer(28, 2, false);
  detailContainer(-10, -20, false);
  detailContainer(10, -20, true);
  detailContainer(-16, 22, true);
  detailContainer(16, 22, false);

  // Tarps draped over crate stacks (slightly rotated, sagging look).
  const tarpA = vbox(2.0, 0.08, 2.0, -17.8, 2.5, -8, matTarpGreen, 0.18);
  tarpA.rotation.z = 0.08;
  const tarpB = vbox(2.0, 0.08, 2.0, 17.8, 2.5, -8, matTarpTan, -0.12);
  tarpB.rotation.x = -0.06;
  const tarpC = vbox(1.5, 0.08, 1.5, 0, 1.28, -6, matTarpGreen, 0.3);
  tarpC.rotation.z = -0.05;

  // Camouflage netting draped over sandbag lines (semi-transparent, sagging).
  const netMid = vplane(6.4, 3.4, 0, 1.17, 2, matCamo, 0);
  netMid.rotation.x = -Math.PI / 2 + 0.05;
  netMid.rotation.z = 0.04;
  const netMidSide = vplane(6.4, 1.0, 0, 0.62, 3.56, matCamo, 0);
  netMidSide.rotation.x = 0.08;
  const netA = vplane(4.4, 1.2, -13, 1.16, -7.5, matCamo, 0);
  netA.rotation.x = -Math.PI / 2 + 0.04;
  netA.rotation.z = -0.05;

  // Battle damage: a dark crack plane + a slab leaning on the Site A wall,
  // and rubble piles at the base of the H3 west wall and the Site B wall.
  vplane(0.5, 1.2, -10.73, 1.8, -13, matDark, Math.PI / 2);
  const slab = vbox(0.08, 1.5, 0.6, -10.55, 0.75, -13.2, matConcreteDark, 0);
  slab.rotation.z = 0.28;
  rock(-28.6, -16.4, 0.4, matRockDark, 0.4, 0.2);
  rock(-28.9, -15.7, 0.3, matRock, 1.2, -0.15);
  rock(-28.5, -15.2, 0.24, matRockDark, 2.1, 0.1);
  rock(-28.8, -16.9, 0.28, matRock, 0.8, 0.25);
  rock(10.55, -7.4, 0.36, matRock, 0.9, -0.2);
  rock(10.7, -6.6, 0.26, matRockDark, 2.4, 0.15);
  rock(10.45, -6.9, 0.22, matRock, 1.7, -0.1);

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
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 34;
  sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 100;
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
