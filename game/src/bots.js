// Bots (v2 — free-for-all battle royale): the other soldiers. Each is a humanoid
// soldier in muted military kit — tapered torso, helmet dome, plate carrier, pads —
// with a head mesh and a torso mesh a bullet can hit. They navigate the waypoint
// graph, roam, chase loot, rotate into the
// zone, react to what they see and hear, and shoot back in bursts with their own
// weapon's stats. Every bot is hostile to every other combatant (player + all bots);
// the player is the camera, so a bot checks a hit on the player against a capsule.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';
import { createMover, STAND_EYE } from './player.js';

const BOT_SPEED = 4.0;
const BOT_HEALTH = 100;
const SEE_RANGE = 45;
const SEE_FOV = 1.05;
const SHOT_DAMAGE = 26; // Fallback only, when the bot's weapon has no definition.
const HEAD_MULT = 2.5; // Fallback only, when the bot's weapon has no definition.
const FIRE_GAP_FALLBACK = 0.13;
const BURST_MIN = 3;
const BURST_MAX = 5;
const REACTION_MIN = 0.25;
const REACTION_MAX = 0.6;
const SHOTGUN_PELLETS = 8;
const SHOTGUN_SPREAD_EXTRA = 0.03;
const LOOT_CHASE_RANGE = 30; // How far a poorly-armed bot will travel for a better gun.
const LOOT_UPGRADE_RANGE = 4; // How close an upgrade pickup must be for an armed bot.
const LOOT_ARRIVE_DIST = 1.5;
const ZONE_FIGHT_RANGE = 12; // Outside the zone, only fight enemies closer than this.

// Muted military cloth colours (olive drab / tan / grey-green / dusty brown) so
// bots stay distinct from each other yet read dark against the sand.
const CLOTH_COLORS = ['#5c6244', '#7d7154', '#565a52', '#3f4a35', '#6b5138', '#4f565c'];

// Fallback weapon tiers when ctx.lootValue is not provided.
const TIER_FALLBACK = { pistol: 1, smg: 2, shotgun: 2, rifle: 3, dmr: 4, sniper: 4 };

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();

function randomWeaponId() {
  // NOTE: loot.js does not exist yet, so there is no randomWeapon to import. When it
  // lands, replace this with `import { randomWeapon } from './loot.js'` and use it.
  const ids = Object.keys(WEAPONS);
  return ids[Math.floor(Math.random() * ids.length)];
}

function weaponStats(bot) {
  const def = WEAPONS[bot.weaponId];
  if (!def) {
    return {
      damage: SHOT_DAMAGE, headMult: HEAD_MULT, fireGap: FIRE_GAP_FALLBACK,
      kind: 'rifle', pellets: 1, spreadExtra: 0, range: 60,
    };
  }
  const isShotgun = def.kind === 'shotgun';
  return {
    damage: def.damage,
    headMult: def.headMult,
    fireGap: def.fireGap,
    kind: def.kind,
    pellets: isShotgun ? (def.pellets || SHOTGUN_PELLETS) : 1,
    spreadExtra: isShotgun ? SHOTGUN_SPREAD_EXTRA : 0,
    range: def.range || 60,
  };
}

function weaponTier(bot, ctx) {
  if (ctx && typeof ctx.lootValue === 'function') return ctx.lootValue(bot.weaponId);
  return TIER_FALLBACK[bot.weaponId] ?? 1;
}

function buildSoldier(color) {
  const group = new THREE.Group();
  const clothColor = new THREE.Color(color);
  const cloth = new THREE.MeshStandardMaterial({ color: clothColor, roughness: 0.85, metalness: 0.05 });
  // Darker shade of the same uniform, for the helmet, pads and belt.
  const clothDark = new THREE.MeshStandardMaterial({ color: clothColor.clone().multiplyScalar(0.6), roughness: 0.9, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.metal), roughness: 0.6, metalness: 0.4 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c8a06a'), roughness: 0.8 });

  // Legs: two separate tapered limbs with a visible gap between them. The geometry
  // is translated so each mesh origin sits at the hip — the walk swing rotates
  // around the hip, not the middle of the leg. Knee pads and boots are children
  // of the leg, so they swing with it.
  const legGeo = new THREE.CylinderGeometry(0.075, 0.062, 0.62, 8);
  legGeo.translate(0, -0.31, 0);
  const legL = new THREE.Mesh(legGeo, cloth);
  legL.position.set(-0.115, 0.62, 0);
  const legR = new THREE.Mesh(legGeo, cloth);
  legR.position.set(0.115, 0.62, 0);
  const kneeGeo = new THREE.CylinderGeometry(0.082, 0.082, 0.12, 8);
  const bootGeo = new THREE.BoxGeometry(0.15, 0.09, 0.26);
  for (const leg of [legL, legR]) {
    const knee = new THREE.Mesh(kneeGeo, clothDark);
    knee.position.set(0, -0.3, -0.01);
    const boot = new THREE.Mesh(bootGeo, dark);
    boot.position.set(0, -0.575, -0.03);
    leg.add(knee, boot);
  }

  // Torso: a tapered square frustum — shoulders wider than the waist, taller than
  // wide, flattened front-to-back. Flat-shaded so the faces read as panels, not a
  // tube. Same bounding size as before (~0.47m wide at the shoulders, 0.66m tall,
  // centred at 0.95m) so body shots register exactly as they did.
  let torsoGeo = new THREE.CylinderGeometry(0.33, 0.28, 0.66, 4, 1, false, Math.PI / 4);
  torsoGeo = torsoGeo.toNonIndexed();
  torsoGeo.computeVertexNormals();
  const torso = new THREE.Mesh(torsoGeo, cloth);
  torso.scale.z = 0.65;
  torso.position.y = 0.95;
  torso.userData.part = 'torso';

  // Plate carrier: a darker chest plate (the vest part) plus a back plate, and a
  // belt with a pouch at the waist. Forward is -Z, so the chest plate is at -Z.
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.07), dark);
  vest.position.set(0, 1.02, -0.13);
  const backPlate = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.07), dark);
  backPlate.position.set(0, 1.02, 0.13);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.3), clothDark);
  belt.position.y = 0.66;
  const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.06), clothDark);
  pouch.position.set(0.1, 0.65, -0.16);

  // Head: a sphere, clearly smaller than the torso, with a proper helmet dome
  // (sphere half, darker shade of the uniform) and a rim over it.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 12), skin);
  head.position.y = 1.49;
  head.userData.part = 'head';
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.165, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), clothDark);
  helmet.position.y = 1.5;
  const helmetRim = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.03, 16), clothDark);
  helmetRim.position.y = 1.485;

  // Arms: tapered, hanging at the sides with a slight outward splay, ending near
  // mid-thigh (gloves reach ~0.55m). Geometry translated so the origin is at the
  // shoulder — the walk swing rotates around the shoulder. Elbow pads and gloves
  // are children of the arm. Note: rotation.x is overwritten every frame by the
  // walk animation, so the splay is baked into rotation.z, which it never touches.
  const armGeo = new THREE.CylinderGeometry(0.055, 0.047, 0.64, 8);
  armGeo.translate(0, -0.32, 0);
  const armL = new THREE.Mesh(armGeo, cloth);
  armL.position.set(-0.27, 1.24, -0.02);
  armL.rotation.z = -0.08;
  const armR = new THREE.Mesh(armGeo, cloth);
  armR.position.set(0.27, 1.24, -0.02);
  armR.rotation.z = 0.08;
  const elbowGeo = new THREE.CylinderGeometry(0.062, 0.062, 0.1, 8);
  const gloveGeo = new THREE.BoxGeometry(0.075, 0.1, 0.075);
  for (const arm of [armL, armR]) {
    const elbow = new THREE.Mesh(elbowGeo, clothDark);
    elbow.position.y = -0.32;
    const glove = new THREE.Mesh(gloveGeo, dark);
    glove.position.y = -0.64;
    arm.add(elbow, glove);
  }

  // Rifle held across the body, muzzle forward (-Z). A group of small parts, kept
  // at the same position as the old single-box gun so firing/kick behaviour is
  // unchanged (update() still drives gun.position.z).
  const gun = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.38), dark);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 8), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.015, -0.28);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.12), clothDark);
  stock.position.set(0, -0.01, 0.24);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.13, 0.08), dark);
  mag.position.set(0, -0.11, -0.03);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.06), dark);
  sight.position.set(0, 0.08, 0.05);
  gun.add(receiver, barrel, stock, mag, sight);
  gun.position.set(0.18, 1.15, -0.25);

  group.add(legL, legR, torso, vest, backPlate, belt, pouch, head, helmet, helmetRim, armL, armR, gun);
  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return { group, torso, head, helmet, vest, armL, armR, legL, legR, gun };
}

export function createBots(scene, world, opts) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 80;
  const bots = [];
  const hitMeshes = [];
  let nextId = 1;

  function spawn(name, position, weaponId) {
    const parts = buildSoldier(CLOTH_COLORS[(nextId - 1) % CLOTH_COLORS.length]);
    parts.group.position.copy(position);
    scene.add(parts.group);
    const mover = createMover(world.colliders, position);
    mover.state.yaw = Math.random() * Math.PI * 2;
    const bot = {
      id: nextId, name, team: 'ffa', parts, mover,
      health: BOT_HEALTH, armor: 0, helmetTier: 0,
      weaponId: weaponId || randomWeaponId(),
      alive: true, fall: 0,
      path: [], pathIndex: 0, dest: null, stuckTimer: 0, lastPos: position.clone(),
      target: null, aimError: 0.05, burstLeft: 0, burstTimer: 0, reactTimer: 0,
      thinkTimer: Math.random() * 0.15, alertPos: null, alertTimer: 0,
      intent: 'roam', lootTarget: null, walkPhase: 0, gunKick: 0,
    };
    nextId += 1;
    parts.torso.userData.bot = bot;
    parts.head.userData.bot = bot;
    hitMeshes.push(parts.torso, parts.head);
    bots.push(bot);
    return bot;
  }

  function setPath(bot, dest) {
    bot.path = world.findPath(bot.mover.state.position, dest);
    bot.pathIndex = 0;
    bot.dest = dest.clone();
  }

  function visibleEnemy(bot, ctx) {
    if (typeof ctx.enemiesOf !== 'function') return null;
    let best = null;
    let bestDist = Infinity;
    for (const enemy of ctx.enemiesOf(bot)) {
      if (!enemy.alive) continue;
      _v1.copy(enemy.eyePos()).sub(bot.mover.state.position);
      _v1.y -= STAND_EYE;
      const dist = _v1.length();
      if (dist > SEE_RANGE || dist < 0.5) continue;
      const forward = _v2.set(-Math.sin(bot.mover.state.yaw), 0, -Math.cos(bot.mover.state.yaw));
      const toEnemy = _v1.clone().normalize();
      if (forward.dot(toEnemy) < Math.cos(SEE_FOV)) continue;
      if (!ctx.lineOfSight(botEye(bot), enemy.eyePos())) continue;
      if (dist < bestDist) { bestDist = dist; best = enemy; }
    }
    return best;
  }

  function botEye(bot) {
    return _v1.set(bot.mover.state.position.x, bot.mover.state.position.y + STAND_EYE, bot.mover.state.position.z).clone();
  }

  function aimAt(bot, point, dt) {
    const p = bot.mover.state.position;
    const dx = point.x - p.x;
    const dy = point.y - (p.y + STAND_EYE);
    const dz = point.z - p.z;
    const targetYaw = Math.atan2(-dx, -dz);
    const targetPitch = Math.asin(Math.max(-1, Math.min(1, dy / (Math.hypot(dx, dy, dz) || 1))));
    let dyaw = targetYaw - bot.mover.state.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    bot.mover.state.yaw += dyaw * Math.min(1, dt * 6);
    bot.mover.state.pitch += (targetPitch - bot.mover.state.pitch) * Math.min(1, dt * 6);
  }

  function firePellet(bot, ctx, target, stats, eye, aimPoint, dist) {
    const spread = 0.028 + dist * 0.0009 + (target.moving ? 0.012 : 0) + stats.spreadExtra;
    _dir.copy(aimPoint).sub(eye).normalize();
    _dir.x += (Math.random() * 2 - 1) * spread;
    _dir.y += (Math.random() * 2 - 1) * spread;
    _dir.z += (Math.random() * 2 - 1) * spread;
    _dir.normalize();
    raycaster.set(eye, _dir);
    raycaster.far = Math.min(80, dist + 6);
    const wallHit = raycaster.intersectObjects(world.shootables, false)[0];
    const hit = target.hitByRay(eye, _dir, dist + 1.5);
    const wallDist = wallHit ? wallHit.distance : Infinity;
    if (hit && hit.distance < wallDist) {
      ctx.damage(target, stats.damage * (hit.head ? stats.headMult : 1), hit.head, bot);
      ctx.tracer(eye, hit.point, true);
    } else if (wallHit) {
      ctx.tracer(eye, wallHit.point, false);
      ctx.impact(wallHit.point);
    } else {
      ctx.tracer(eye, eye.clone().addScaledVector(_dir, 30), false);
    }
  }

  function fireAt(bot, ctx, target) {
    const stats = weaponStats(bot);
    const eye = botEye(bot);
    const aimPoint = target.aimPoint();
    const dist = eye.distanceTo(aimPoint);
    for (let i = 0; i < stats.pellets; i += 1) {
      firePellet(bot, ctx, target, stats, eye, aimPoint, dist);
    }
    ctx.sound(stats.kind);
    bot.gunKick = 0.09;
  }

  function keysToward(bot, dest) {
    const keys = new Set();
    const p = bot.mover.state.position;
    const dx = dest.x - p.x;
    const dz = dest.z - p.z;
    if (Math.hypot(dx, dz) < 0.3) return keys;
    const sin = Math.sin(bot.mover.state.yaw);
    const cos = Math.cos(bot.mover.state.yaw);
    const forward = -sin * dx + -cos * dz;
    const strafe = cos * dx + -sin * dz;
    if (forward > 0.2) keys.add('KeyW');
    else if (forward < -0.2) keys.add('KeyS');
    if (strafe > 0.2) keys.add('KeyD');
    else if (strafe < -0.2) keys.add('KeyA');
    const targetYaw = Math.atan2(-dx, -dz);
    let dyaw = targetYaw - bot.mover.state.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    bot.mover.state.yaw += dyaw * Math.min(1, 0.12);
    return keys;
  }

  // Zone helpers. ctx.zone may be absent (v1 coordinator); then the bot is "inside".
  function zoneState(bot, ctx) {
    const zone = ctx && ctx.zone;
    if (!zone || !zone.center) return { inside: true, dist: 0 };
    const dx = bot.mover.state.position.x - zone.center.x;
    const dz = bot.mover.state.position.z - zone.center.z;
    return { inside: Math.hypot(dx, dz) <= zone.radius, dist: Math.hypot(dx, dz) };
  }

  function zonePoint(bot, ctx) {
    const zone = ctx.zone;
    // A point just inside the zone: near the centre with a small random offset, so
    // bots do not all pile onto the exact centre.
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * Math.max(0, zone.radius * 0.5);
    return new THREE.Vector3(zone.center.x + Math.cos(angle) * r, 0, zone.center.z + Math.sin(angle) * r);
  }

  function randomRoamPoint(bot, ctx) {
    const zone = ctx && ctx.zone;
    const nodes = world.nodes;
    if (!nodes || nodes.length === 0) return null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const node = nodes[Math.floor(Math.random() * nodes.length)];
      if (!zone || !zone.center) return node.clone();
      const dx = node.x - zone.center.x;
      const dz = node.z - zone.center.z;
      if (Math.hypot(dx, dz) < zone.radius) return node.clone();
    }
    return nodes[Math.floor(Math.random() * nodes.length)].clone();
  }

  // Loot: only when no enemy is visible and the bot is inside the zone. Returns a
  // pickup to chase, or null. Poorly armed bots (tier <= 1) search far; armed bots
  // only detour for a close upgrade.
  function lootToChase(bot, ctx) {
    if (!ctx || !ctx.loot || typeof ctx.loot.nearestPickup !== 'function') return null;
    const myTier = weaponTier(bot, ctx);
    const maxDist = myTier <= 1 ? LOOT_CHASE_RANGE : LOOT_UPGRADE_RANGE;
    const pickup = ctx.loot.nearestPickup(bot.mover.state.position, maxDist);
    if (!pickup || !pickup.weaponId) return null;
    const pickupTier = typeof ctx.lootValue === 'function'
      ? ctx.lootValue(pickup.weaponId)
      : (TIER_FALLBACK[pickup.weaponId] ?? 1);
    if (pickupTier <= myTier) return null;
    return pickup;
  }

  function update(dt, time, ctx) {
    for (const bot of bots) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.parts.group.rotation.x = -bot.fall * 1.45;
        bot.parts.group.position.y = -bot.fall * 0.1;
        continue;
      }
      bot.thinkTimer -= dt;
      const zone = zoneState(bot, ctx);
      let justThought = false;
      if (bot.thinkTimer <= 0) {
        bot.thinkTimer = 0.15;
        justThought = true;
        bot.target = visibleEnemy(bot, ctx);
        if (bot.target) bot.reactTimer = Math.max(bot.reactTimer, REACTION_MIN + Math.random() * (REACTION_MAX - REACTION_MIN));
      }
      const p = bot.mover.state;
      let keys = new Set();

      // Fight only if inside the zone, or the enemy is very close (<12m). Outside
      // the zone the top priority is rotating in — even with a visible enemy.
      const targetDist = bot.target
        ? p.position.distanceTo(bot.target.eyePos())
        : Infinity;
      const canFight = bot.target && bot.reactTimer <= 0 && (zone.inside || targetDist < ZONE_FIGHT_RANGE);

      if (canFight) {
        bot.intent = 'fight';
        bot.lootTarget = null;
        aimAt(bot, bot.target.aimPoint(), dt);
        bot.burstTimer -= dt;
        if (bot.burstTimer <= 0) {
          if (bot.burstLeft <= 0) {
            bot.burstLeft = BURST_MIN + Math.floor(Math.random() * (BURST_MAX - BURST_MIN + 1));
            bot.burstTimer = 0.55 + Math.random() * 0.5;
          } else {
            fireAt(bot, ctx, bot.target);
            bot.burstLeft -= 1;
            bot.burstTimer = weaponStats(bot).fireGap;
          }
        }
      } else {
        bot.reactTimer -= dt;
        // Movement priority: zone rotation > loot > roam.
        if (!zone.inside) {
          if (bot.intent !== 'zone' || bot.pathIndex >= bot.path.length) {
            bot.intent = 'zone';
            bot.lootTarget = null;
            setPath(bot, zonePoint(bot, ctx));
          }
        } else if (!bot.target && justThought) {
          // Loot is only considered on think ticks, when no enemy is visible.
          const pickup = lootToChase(bot, ctx);
          if (pickup) {
            bot.intent = 'loot';
            bot.lootTarget = pickup;
            setPath(bot, pickup.pos || pickup.position || pickup);
          } else if (bot.intent === 'loot') {
            bot.intent = 'roam';
            bot.lootTarget = null;
          }
        }
        if (bot.intent !== 'zone' && bot.intent !== 'loot'
          && (bot.path.length === 0 || bot.pathIndex >= bot.path.length)) {
          bot.intent = 'roam';
          const dest = randomRoamPoint(bot, ctx);
          if (dest) setPath(bot, dest);
        }
        if (bot.pathIndex < bot.path.length) {
          const wp = bot.path[bot.pathIndex];
          if (p.position.distanceTo(wp) < 0.9) {
            bot.pathIndex += 1;
            // Arrived at a loot pickup: take it and swap weapons.
            if (bot.intent === 'loot' && bot.lootTarget && bot.pathIndex >= bot.path.length) {
              if (p.position.distanceTo(bot.lootTarget.pos || bot.lootTarget.position || bot.lootTarget) < LOOT_ARRIVE_DIST + 1) {
                if (ctx.loot && typeof ctx.loot.takePickup === 'function') {
                  ctx.loot.takePickup(bot.lootTarget);
                }
                bot.weaponId = bot.lootTarget.weaponId;
              }
              bot.lootTarget = null;
              bot.intent = 'roam';
            }
          } else {
            keys = keysToward(bot, wp);
          }
        }
        // Stuck: repath to the destination.
        if (p.position.distanceTo(bot.lastPos) < 0.05) bot.stuckTimer += dt;
        else { bot.stuckTimer = 0; bot.lastPos.copy(p.position); }
        if (bot.stuckTimer > 2 && bot.dest) { setPath(bot, bot.dest); bot.stuckTimer = 0; }
      }

      bot.mover.step(dt, keys);
      const speed = bot.mover.groundSpeed();
      bot.walkPhase += dt * speed * 2.4;
      const swing = Math.min(1, speed / BOT_SPEED) * 0.55;
      bot.parts.legL.rotation.x = Math.sin(bot.walkPhase) * swing;
      bot.parts.legR.rotation.x = -Math.sin(bot.walkPhase) * swing;
      bot.parts.armL.rotation.x = -Math.sin(bot.walkPhase) * swing * 0.6;
      bot.parts.armR.rotation.x = Math.sin(bot.walkPhase) * swing * 0.6;
      bot.parts.group.position.copy(p.position);
      bot.parts.group.rotation.y = p.yaw;
      bot.gunKick = Math.max(0, (bot.gunKick || 0) - dt * 0.5);
      bot.parts.gun.position.z = -0.25 + bot.gunKick;
    }
  }

  function alert(pos) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      if (bot.mover.state.position.distanceTo(pos) < 26) {
        bot.alertPos = pos.clone();
        bot.alertTimer = 3;
        if (!bot.target) setPath(bot, pos);
      }
    }
  }

  function resetMatch(dropPoints) {
    const points = dropPoints && dropPoints.length ? dropPoints : [new THREE.Vector3(0, 0, 0)];
    for (let i = 0; i < bots.length; i += 1) {
      const bot = bots[i];
      bot.health = BOT_HEALTH;
      bot.armor = 0;
      bot.helmetTier = 0;
      bot.alive = true;
      bot.fall = 0;
      bot.path = [];
      bot.pathIndex = 0;
      bot.dest = null;
      bot.target = null;
      bot.burstLeft = 0;
      bot.burstTimer = 0;
      bot.reactTimer = 0;
      bot.stuckTimer = 0;
      bot.intent = 'roam';
      bot.lootTarget = null;
      bot.weaponId = randomWeaponId();
      const spawn = points[i % points.length];
      bot.mover.state.position.copy(spawn);
      bot.mover.state.velocity.set(0, 0, 0);
      bot.mover.state.yaw = Math.random() * Math.PI * 2;
      bot.mover.state.pitch = 0;
      bot.lastPos.copy(spawn);
      bot.parts.group.rotation.set(0, bot.mover.state.yaw, 0);
      bot.parts.group.position.copy(spawn);
      bot.parts.group.position.y = 0;
    }
  }

  return {
    bots, hitMeshes, spawn, update, alert, resetMatch,
    // Back-compat alias: v1 called this resetRound(spawns).
    resetRound(dropPoints) { resetMatch(dropPoints); },
    aliveCount() { return bots.filter((b) => b.alive).length; },
    // No-op stub for compatibility: FFA has no patrol routes.
    setPatrol() {},
  };
}
