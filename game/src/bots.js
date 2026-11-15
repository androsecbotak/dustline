// Bots: the other soldiers. Each is a humanoid built from boxes in its team colour, with a
// head mesh and a torso mesh a bullet can hit. They navigate the waypoint graph, hold
// positions, follow routes, react to what they see and hear, and shoot back in bursts.
// The player is the camera, so a bot checks a hit on the player against a capsule.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMover, STAND_EYE } from './player.js';

const BOT_SPEED = 4.0;
const BOT_HEALTH = 100;
const SEE_RANGE = 45;
const SEE_FOV = 1.05;
const SHOT_DAMAGE = 26;
const HEAD_MULT = 2.5;
const BURST_MIN = 3;
const BURST_MAX = 5;
const REACTION_MIN = 0.25;
const REACTION_MAX = 0.6;

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();

function buildSoldier(team) {
  const color = team === 'vanguard' ? PALETTE.vanguard : PALETTE.crimson;
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.8, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.metal), roughness: 0.6, metalness: 0.4 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c8a06a'), roughness: 0.8 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), dark);
  legL.position.set(-0.11, 0.25, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.3), cloth);
  torso.position.y = 0.95;
  torso.userData.part = 'torso';
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.4, 0.34), dark);
  vest.position.y = 0.98;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
  head.position.y = 1.48;
  head.userData.part = 'head';
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.175, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), cloth);
  helmet.position.y = 1.5;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), cloth);
  armL.position.set(-0.32, 1.05, 0.08);
  const armR = armL.clone();
  armR.position.x = 0.32;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), dark);
  gun.position.set(0.18, 1.15, -0.25);
  group.add(legL, legR, torso, vest, head, helmet, armL, armR, gun);
  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return { group, legL, legR, armL, armR, torso, head, gun };
}

export function createBots(scene, world, opts) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 80;
  const bots = [];
  const hitMeshes = [];
  let nextId = 1;

  function spawn(team, role, position, name) {
    const parts = buildSoldier(team);
    parts.group.position.copy(position);
    scene.add(parts.group);
    const mover = createMover(world.colliders, position);
    mover.state.yaw = team === 'vanguard' ? 0 : Math.PI;
    const bot = {
      id: nextId, name, team, role, parts, mover,
      health: BOT_HEALTH, alive: true, fall: 0,
      path: [], pathIndex: 0, dest: null, stuckTimer: 0, lastPos: position.clone(),
      patrol: [], patrolIndex: 0,
      target: null, aimError: 0.05, burstLeft: 0, burstTimer: 0, reactTimer: 0,
      thinkTimer: Math.random() * 0.15, alertPos: null, alertTimer: 0,
      plantTimer: 0, defuseTimer: 0, hasBomb: false, walkPhase: 0,
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

  function fireAt(bot, ctx, target) {
    const eye = botEye(bot);
    const aimPoint = target.aimPoint();
    const dist = eye.distanceTo(aimPoint);
    const spread = 0.028 + dist * 0.0009 + (target.moving ? 0.012 : 0);
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
      ctx.damage(target, SHOT_DAMAGE * (hit.head ? HEAD_MULT : 1), hit.head, bot);
      ctx.tracer(eye, hit.point, true);
    } else if (wallHit) {
      ctx.tracer(eye, wallHit.point, false);
      ctx.impact(wallHit.point);
    } else {
      ctx.tracer(eye, eye.clone().addScaledVector(_dir, 30), false);
    }
    ctx.sound('rifle');
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

  function update(dt, time, ctx) {
    for (const bot of bots) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.parts.group.rotation.x = -bot.fall * 1.45;
        bot.parts.group.position.y = -bot.fall * 0.1;
        continue;
      }
      bot.thinkTimer -= dt;
      if (bot.thinkTimer <= 0) {
        bot.thinkTimer = 0.15;
        bot.target = visibleEnemy(bot, ctx);
        if (bot.target) bot.reactTimer = Math.max(bot.reactTimer, REACTION_MIN + Math.random() * (REACTION_MAX - REACTION_MIN));
      }
      const p = bot.mover.state;
      let keys = new Set();

      // Bomb duties come first: plant when the carrier reaches a site, defuse when the
      // enemy planted and a defender reaches that site.
      if (bot.hasBomb && bot.role === 'attack') {
        const site = ctx.bombSiteFor(bot);
        if (site && p.position.distanceTo(site) < 2.5) {
          bot.plantTimer += dt;
          ctx.plantProgress(bot, bot.plantTimer / 3);
          if (bot.plantTimer >= 3) { ctx.plantBomb(site, bot); bot.hasBomb = false; bot.plantTimer = 0; }
        } else if (site) {
          setPath(bot, site);
          bot.plantTimer = 0;
        }
      }
      if (ctx.bombPlanted && bot.team === 'crimson') {
        const site = ctx.plantedSite;
        if (site && p.position.distanceTo(site) < 2.2) {
          bot.defuseTimer += dt;
          ctx.defuseProgress(bot, bot.defuseTimer / 5);
          if (bot.defuseTimer >= 5) { ctx.defuseBomb(bot); bot.defuseTimer = 0; }
        } else if (site && bot.role.startsWith('defend')) {
          setPath(bot, site);
          bot.defuseTimer = 0;
        }
      }

      if (bot.target && bot.reactTimer <= 0) {
        aimAt(bot, bot.target.aimPoint(), dt);
        bot.burstTimer -= dt;
        if (bot.burstTimer <= 0) {
          if (bot.burstLeft <= 0) {
            bot.burstLeft = BURST_MIN + Math.floor(Math.random() * (BURST_MAX - BURST_MIN + 1));
            bot.burstTimer = 0.55 + Math.random() * 0.5;
          } else {
            fireAt(bot, ctx, bot.target);
            bot.burstLeft -= 1;
            bot.burstTimer = 0.13;
          }
        }
      } else {
        bot.reactTimer -= dt;
        // Move: follow the path, or patrol the assigned site.
        if (bot.path.length === 0 || bot.pathIndex >= bot.path.length) {
          if (bot.role === 'attack') {
            const site = ctx.attackSiteFor(bot);
            if (site) setPath(bot, site);
          } else {
            bot.patrolIndex = (bot.patrolIndex + 1) % bot.patrol.length;
            setPath(bot, bot.patrol[bot.patrolIndex]);
          }
        }
        if (bot.pathIndex < bot.path.length) {
          const wp = bot.path[bot.pathIndex];
          if (p.position.distanceTo(wp) < 0.9) bot.pathIndex += 1;
          else keys = keysToward(bot, wp);
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

  function resetRound(spawns) {
    for (const bot of bots) {
      bot.health = BOT_HEALTH;
      bot.alive = true;
      bot.fall = 0;
      bot.path = [];
      bot.pathIndex = 0;
      bot.target = null;
      bot.burstLeft = 0;
      bot.burstTimer = 0;
      bot.reactTimer = 0;
      bot.plantTimer = 0;
      bot.defuseTimer = 0;
      bot.hasBomb = false;
      bot.stuckTimer = 0;
      const spawn = spawns[bot.team][bots.filter((b) => b.team === bot.team).indexOf(bot) % spawns[bot.team].length];
      bot.mover.state.position.copy(spawn);
      bot.mover.state.velocity.set(0, 0, 0);
      bot.mover.state.yaw = bot.team === 'vanguard' ? 0 : Math.PI;
      bot.mover.state.pitch = 0;
      bot.lastPos.copy(spawn);
      bot.parts.group.rotation.set(0, bot.mover.state.yaw, 0);
      bot.parts.group.position.copy(spawn);
      bot.parts.group.position.y = 0;
    }
  }

  return {
    bots, hitMeshes, spawn, update, alert, resetRound,
    aliveCount(team) { return bots.filter((b) => b.team === team && b.alive).length; },
    setPatrol(bot, points) { bot.patrol = points; bot.patrolIndex = 0; },
  };
}
