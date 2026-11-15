// The map: DUSTLINE compound, a desert outpost at dusk. Two bombsites (A west, B east),
// a mid courtyard, west and east lanes, Vanguard spawn south, Crimson spawn north.
// Every box is a collider for players and bots and a surface a bullet stops on.
// Textures are procedural (textures.js); the sky is a gradient sphere; the sun is low
// and warm so shadows run long. Waypoints feed the bots' pathfinding.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import * as Textures from './textures.js';

export const MAP = {
  minX: -22, maxX: 22, minZ: -18, maxZ: 18,
  sites: {
    A: new THREE.Vector3(-16, 0, -10),
    B: new THREE.Vector3(16, 0, -10),
  },
  spawns: {
    vanguard: [new THREE.Vector3(-6, 0, 15), new THREE.Vector3(0, 0, 15), new THREE.Vector3(6, 0, 15)],
    crimson: [new THREE.Vector3(-6, 0, -15), new THREE.Vector3(0, 0, -15), new THREE.Vector3(6, 0, -15)],
  },
};

  const WAYPOINTS = [
  [-6, 15], [0, 15], [6, 15],
  [-6, -15], [0, -15], [6, -15],
  [-16, -10], [-14, -9], [-18, -11], [-16, -5],
  [16, -10], [14, -9], [18, -11], [16, -5],
  [0, 6], [-5, 2], [5, 2], [0, -7], [-5, -4], [5, -4], [0, 8], [0, -10],
  [-17, 6], [-17, -2], [-19, -10],
  [17, 6], [17, -2], [19, -10],
  [-8, -8], [8, -8], [-8, 8], [8, 8],
  [-11, -10], [11, -10], [0, 12], [0, -14],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  const sand = Textures.sandTexture();
  sand.repeat.set(11, 9);
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
  box(44.6, 0.4, 36.6, 0, -0.2, 0, matSand);
  box(44.6, 4.2, 0.6, 0, 2.1, -18.3, matConcrete);
  box(44.6, 4.2, 0.6, 0, 2.1, 18.3, matConcrete);
  box(0.6, 4.2, 36.6, -22.3, 2.1, 0, matConcrete);
  box(0.6, 4.2, 36.6, 22.3, 2.1, 0, matConcrete);

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
  // Barrels (cylinders, collided as boxes).
  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 14);
  for (const [bx, bz] of [[-8, 4], [8, 4], [-14, 2], [14, 2], [-4, -12], [4, -12]]) {
    const barrel = new THREE.Mesh(barrelGeo, matMetal);
    barrel.position.set(bx, 0.55, bz);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    group.add(barrel);
    colliders.push(new THREE.Box3(new THREE.Vector3(bx - 0.45, 0, bz - 0.45), new THREE.Vector3(bx + 0.45, 1.1, bz + 0.45)));
    shootables.push(barrel);
  }

  // Site decals: a big letter on the ground at each bombsite.
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
    new THREE.SphereGeometry(120, 24, 16),
    new THREE.MeshBasicMaterial({ map: Textures.skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 110);

  // Light: a low warm sun from the west, a cool fill from the east, a sky/ground gradient.
  const hemi = new THREE.HemisphereLight(new THREE.Color('#7a8ba0'), new THREE.Color(PALETTE.sandDark), 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb36b'), 2.6);
  sun.position.set(-26, 16, 10);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5a6b7a'), 0.45);
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
