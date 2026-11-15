// DUSTLINE v2: a PUBG-style battle royale. 12 drop in, 1 walks out. Loot weapons,
// armour and healing from the ground, survive the shrinking blue zone, and be the
// last one alive. Boot and the one loop: a fixed 60 Hz simulation feeding a render
// at the display's rate. ?shot=start|play|loot|end with &seed=N sets up a
// deterministic frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, MAP } from './world.js';
import { createInput } from './input.js';
import { createPlayer, STAND_EYE } from './player.js';
import { createWeaponRig, createGrenade, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createBR } from './br.js';
import { createZone } from './zone.js';
import { createLoot, randomWeapon, WEAPON_PICKUP_AMMO } from './loot.js';
import { createHeal } from './heal.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const MAX_HEALTH = 100;
const TOTAL_PLAYERS = 12;
const DROP_SECONDS = 3;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const hud = createHud();
const input = createInput(renderer.domElement, onLockChange);
const player = createPlayer(world.colliders);
const weaponRig = createWeaponRig(camera, audio);
const grenade = createGrenade(scene, world.colliders);
const raycaster = new THREE.Raycaster();
raycaster.far = 100;
const direction = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();

// -- battle royale state: the zone, the match, loot on the ground, healing.
const zone = createZone(scene, MAP, random);
const loot = createLoot(scene, world, random);
const heal = createHeal();
const LOOT_TIER = { pistol: 1, smg: 2, shotgun: 2, rifle: 3, dmr: 4, sniper: 4 };

// -- characters: the player and every bot, in one shape, so a bot's shot and the
// player's shot resolve against the same code.
const playerChar = {
  id: 0, team: 'ffa', name: 'You', alive: true,
  eyePos() { return camera.position; },
  aimPoint() { return _tmp.set(player.state.position.x, player.state.position.y + 1.2, player.state.position.z); },
  get moving() { return player.groundSpeed() > 0.5; },
  hitByRay(origin, dir, maxDist) {
    // Ray against the player's capsule: a vertical segment, radius 0.34.
    const p = player.state.position;
    const ox = origin.x - p.x; const oz = origin.z - p.z;
    const dx = dir.x; const dz = dir.z;
    const a = dx * dx + dz * dz;
    if (a < 1e-8) return null;
    const t = Math.max(0, -(ox * dx + oz * dz) / a);
    const cx = ox + dx * t; const cz = oz + dz * t;
    const radial = Math.hypot(cx, cz);
    if (radial > 0.34) return null;
    const hitY = origin.y + dir.y * t;
    if (hitY < p.y - 0.1 || hitY > p.y + 1.72) return null;
    if (t > maxDist) return null;
    return { distance: t, point: _tmp2.set(origin.x + dir.x * t, hitY, origin.z + dir.z * t).clone(), head: hitY > p.y + 1.35 };
  },
};

let playerHealth = MAX_HEALTH;
let playerArmor = 0;
let playerHelmetTier = 0;
let grenades = 0;
let ownedWeapons = ['pistol'];
let currentWeaponId = 'pistol';
let started = false;
let frozen = false;
let elapsed = 0;
let dropTimer = DROP_SECONDS;
let lastZoneFlashAt = -10;
let minimapTick = 0;

weaponRig.equip(WEAPONS.pistol);

// -- tracers and impacts: small pools, reused, never allocated in the hot loop.
const tracers = [];
for (let i = 0; i < 14; i += 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }));
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}
let tracerIndex = 0;
function spawnTracer(from, to, hit) {
  const t = tracers[tracerIndex];
  tracerIndex = (tracerIndex + 1) % tracers.length;
  const pos = t.line.geometry.attributes.position;
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  t.line.material.color.set(hit ? new THREE.Color('#ffd27a') : new THREE.Color(PALETTE.accent));
  t.line.material.opacity = 0.85;
  t.life = 0.09;
}
const impacts = [];
for (let i = 0; i < 10; i += 1) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#d8c49a'), transparent: true, opacity: 0 }),
  );
  mesh.visible = false;
  scene.add(mesh);
  impacts.push({ mesh, life: 0 });
}
let impactIndex = 0;
function spawnImpact(point) {
  const imp = impacts[impactIndex];
  impactIndex = (impactIndex + 1) % impacts.length;
  imp.mesh.position.copy(point);
  imp.mesh.visible = true;
  imp.mesh.scale.setScalar(0.5);
  imp.mesh.material.opacity = 0.85;
  imp.life = 0.4;
}

// -- bots: 11 free-for-all opponents. Last alive wins.
const bots = createBots(scene, world, {});
const BOT_NAMES = ['Viper', 'Reaper', 'Ghost', 'Onyx', 'Falcon', 'Havoc', 'Blaze', 'Storm', 'Rogue', 'Ace', 'Nova'];
const botList = [];
// Drop points: shuffled with the seeded rng; the player takes one, bots take the rest.
const dropOrder = [...MAP.dropPoints];
for (let i = dropOrder.length - 1; i > 0; i -= 1) {
  const j = Math.floor(random() * (i + 1));
  [dropOrder[i], dropOrder[j]] = [dropOrder[j], dropOrder[i]];
}
for (let i = 0; i < BOT_NAMES.length; i += 1) {
  const bot = bots.spawn(BOT_NAMES[i], new THREE.Vector3(dropOrder[i + 1].x, 0, dropOrder[i + 1].z), randomWeapon(random));
  botList.push(bot);
}

// A bot's view of a character: the same shape as the player, so the same code resolves
// a shot against either.
function botChar(bot) {
  return {
    id: bot.id, team: 'ffa', name: bot.name, bot,
    get alive() { return bot.alive; },
    eyePos() { return _tmp.set(bot.mover.state.position.x, bot.mover.state.position.y + STAND_EYE, bot.mover.state.position.z).clone(); },
    aimPoint() { return _tmp.set(bot.mover.state.position.x, bot.mover.state.position.y + 1.15, bot.mover.state.position.z).clone(); },
    get moving() { return bot.mover.groundSpeed() > 0.5; },
    hitByRay(origin, dir, maxDist) {
      raycaster.set(origin, dir);
      raycaster.far = maxDist;
      const hits = raycaster.intersectObjects([bot.parts.torso, bot.parts.head], false);
      if (!hits.length) return null;
      const h = hits[0];
      return { distance: h.distance, point: h.point.clone(), head: h.object.userData.part === 'head' };
    },
  };
}
const botChars = new Map();
for (const bot of bots.bots) botChars.set(bot.id, botChar(bot));

// Free-for-all: every other alive combatant is an enemy.
function enemiesOf(bot) {
  const list = [];
  if (playerChar.alive) list.push(playerChar);
  for (const other of botList) {
    if (other === bot || !other.alive) continue;
    list.push(botChars.get(other.id));
  }
  return list;
}

function lineOfSight(a, b) {
  _tmp.copy(b).sub(a);
  const dist = _tmp.length();
  if (dist < 0.5) return true;
  _tmp.normalize();
  raycaster.set(a, _tmp);
  raycaster.far = dist;
  return raycaster.intersectObjects(world.shootables, false).length === 0;
}

// -- elimination: a bot dies, or the player dies (placement = alive at that moment).
function killBot(bot, killerName, causeText) {
  if (!bot.alive) return;
  bot.alive = false;
  bot.health = 0;
  hud.killfeed(killerName ? `${killerName} ▸ ${bot.name}` : `${bot.name} ${causeText || 'was eliminated'}`);
  br.onEliminated(bot.name, false);
  checkMatchEnd();
}

function killPlayer(killerName) {
  if (!playerChar.alive) return;
  playerChar.alive = false;
  playerHealth = 0;
  hud.setHealth(0, MAX_HEALTH);
  const placement = br.state.alive; // alive count at the moment the player died
  br.onEliminated('You', true);
  br.endMatch(killerName || 'The zone', false, placement);
  hud.showMatchEnd(placement, killerName || 'The zone', false);
  audio.roundLose();
  if (document.pointerLockElement) document.exitPointerLock();
}

function checkMatchEnd() {
  if (br.state.phase !== 'live') return;
  if (br.state.alive > 1) return;
  if (playerChar.alive) {
    br.endMatch('You', true, 1);
    hud.showMatchEnd(1, 'You', true);
    audio.roundWin();
  } else {
    const last = botList.find((b) => b.alive);
    if (last) {
      br.endMatch(last.name, false, 1);
      hud.showMatchEnd(1, last.name, false);
    }
  }
  if (document.pointerLockElement) document.exitPointerLock();
}

// -- damage: armour absorbs half until it is gone, a helmet softens headshots,
// then health. A kill feeds the kill feed and can end the match.
function damageCharacter(target, amount, isHead, attacker) {
  if (!target.alive) return;
  let finalAmount = Math.round(amount);
  if (isHead) {
    const helmetTier = target === playerChar ? playerHelmetTier : (target.bot ? target.bot.helmetTier : 0);
    if (helmetTier > 0) finalAmount = Math.round(finalAmount * (1 - 0.12 * helmetTier));
  }
  if (target === playerChar) {
    let remaining = finalAmount;
    if (playerArmor > 0) {
      const absorbed = Math.min(playerArmor, Math.round(remaining * 0.5));
      playerArmor -= absorbed;
      remaining -= absorbed;
    }
    playerHealth = Math.max(0, playerHealth - remaining);
    hud.setHealth(playerHealth, MAX_HEALTH);
    hud.setArmor(playerArmor);
    hud.damageFlash();
    audio.hurt();
    if (playerHealth <= 0) {
      const killerName = attacker === playerChar ? 'You' : (attacker ? attacker.name : 'Unknown');
      killPlayer(killerName);
    }
    return;
  }
  const bot = target.bot;
  let remaining = finalAmount;
  if (bot.armor > 0) {
    const absorbed = Math.min(bot.armor, Math.round(remaining * 0.5));
    bot.armor -= absorbed;
    remaining -= absorbed;
  }
  bot.health -= remaining;
  if (bot.health > 0) {
    if (attacker) bot.target = attacker === playerChar ? playerChar : botChars.get(attacker.id);
    return;
  }
  const killer = attacker === playerChar ? 'You' : (attacker ? attacker.name : 'Unknown');
  if (attacker === playerChar) audio.kill();
  killBot(bot, killer, isHead ? '(headshot)' : null);
  // killBot already feeds the killfeed; add the headshot note via a second line only
  // when it was a headshot so the feed stays readable.
  if (isHead) hud.killfeed(`${killer} ▸ ${bot.name} (headshot)`);
}

// -- the bots' context: everything their AI needs from the rest of the game.
const botCtx = {
  enemiesOf,
  lineOfSight,
  damage: damageCharacter,
  tracer(from, to, hit) { spawnTracer(from, to, hit); },
  impact(point) { spawnImpact(point); },
  sound(kind) { audio.shoot(kind); },
  get zone() { return zone.getState(); },
  loot: {
    nearestPickup: (pos, maxDist) => loot.nearestPickup(pos, maxDist),
    takePickup: (pickup) => loot.takePickup(pickup),
  },
  lootValue: (weaponId) => LOOT_TIER[weaponId] || 1,
};

// -- the match flow.
const br = createBR({
  onMatchStart() {
    hud.showBanner('Dropping in…', '12 drop in — 1 walks out', 2600);
    hud.setAlive(TOTAL_PLAYERS, TOTAL_PLAYERS);
  },
  onMatchEnd(winnerName, isPlayerWinner, placement) {
    // The overlay itself is shown by killPlayer / checkMatchEnd.
  },
  onAliveChange(alive) {
    hud.setAlive(alive, TOTAL_PLAYERS);
  },
});

function resetMatch() {
  playerHealth = MAX_HEALTH;
  playerArmor = 0;
  playerHelmetTier = 0;
  grenades = 0;
  playerChar.alive = true;
  player.state.position.set(dropOrder[0].x, 0, dropOrder[0].z);
  player.state.velocity.set(0, 0, 0);
  player.state.yaw = random() * Math.PI * 2;
  player.state.pitch = 0;
  ownedWeapons = ['pistol'];
  currentWeaponId = 'pistol';
  weaponRig.equip(WEAPONS.pistol);
  weaponRig.refillAmmo();
  loot.spawnLoot();
  dropTimer = DROP_SECONDS;
  hud.setHealth(playerHealth, MAX_HEALTH);
  hud.setArmor(0);
  hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, WEAPONS.pistol.name);
  hud.setAlive(TOTAL_PLAYERS, TOTAL_PLAYERS);
  hud.setHeals(0, 0, 0);
  hud.setBoost(0);
  hud.setLootPrompt(null);
  hud.setZone(1, zone.state.timer, zone.state.phaseState);
  syncCamera();
}

// -- healing: 4 bandage, 5 medkit, 6 energy drink. Moving or firing cancels it.
heal.onComplete((event) => {
  if (event.item === 'medkit') {
    playerHealth = MAX_HEALTH;
  } else {
    playerHealth = Math.min(MAX_HEALTH, playerHealth + event.healAmount);
  }
  hud.setHealth(playerHealth, MAX_HEALTH);
  hud.setHeals(heal.getCounts().bandage, heal.getCounts().medkit, heal.getCounts().drink);
  hud.setBoost(heal.getBoost());
  audio.buy();
});

function useHeal(item) {
  if (!playerChar.alive || br.state.phase !== 'live') return;
  const result = heal.startUse(item, () => playerHealth, MAX_HEALTH, heal.boostHealMultiplier());
  if (!result.ok) {
    const reason = { 'none left': `No ${item}s left — loot more`, 'already healing': 'Already healing…', 'already full': 'Health already full' }[result.reason] || result.reason;
    hud.showBanner(reason, '', 1400);
    return;
  }
  hud.setHeals(heal.getCounts().bandage, heal.getCounts().medkit, heal.getCounts().drink);
  hud.showBanner(`Using ${item}…`, 'Keep still — moving or firing cancels it', 1600);
}

// -- loot: describe a pickup for the prompt, and apply one when taken.
function describePickup(pickup) {
  if (!pickup) return null;
  if (pickup.kind === 'weapon') return WEAPONS[pickup.weaponId] ? WEAPONS[pickup.weaponId].name : pickup.weaponId;
  if (pickup.kind === 'ammo') return `Ammo ×${pickup.amount}`;
  if (pickup.kind === 'armor') return `${pickup.slot === 'helmet' ? 'Helmet' : 'Vest'} — Tier ${pickup.tier}`;
  if (pickup.kind === 'heal') return { bandage: 'Bandage', medkit: 'Medkit', drink: 'Energy Drink' }[pickup.item] || pickup.item;
  if (pickup.kind === 'grenade') return 'Frag Grenade';
  return pickup.kind;
}

function applyPickup(pickup) {
  const item = loot.takePickup(pickup);
  if (!item) return;
  if (item.kind === 'weapon') {
    const def = WEAPONS[item.weaponId];
    if (!def) return;
    if (!ownedWeapons.includes(item.weaponId)) ownedWeapons.push(item.weaponId);
    equipWeapon(item.weaponId);
    weaponRig.addReserve(WEAPON_PICKUP_AMMO[item.weaponId] || 30);
    hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, def.name);
    hud.showBanner(`${def.name} picked up`, '', 1400);
    audio.buy();
  } else if (item.kind === 'ammo') {
    weaponRig.addReserve(item.amount);
    hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, weaponRig.def.name);
    audio.buy();
  } else if (item.kind === 'armor') {
    if (item.slot === 'helmet') {
      playerHelmetTier = Math.max(playerHelmetTier, item.tier);
    } else {
      playerArmor = Math.max(playerArmor, item.armorValue);
    }
    hud.setArmor(playerArmor);
    hud.showBanner(`${item.slot === 'helmet' ? 'Helmet' : 'Vest'} Tier ${item.tier} equipped`, '', 1400);
    audio.buy();
  } else if (item.kind === 'heal') {
    heal.add(item.item, 1);
    const counts = heal.getCounts();
    hud.setHeals(counts.bandage, counts.medkit, counts.drink);
    audio.buy();
  } else if (item.kind === 'grenade') {
    grenades += 1;
    audio.buy();
  }
}

// -- weapons the player owns and switching between them.
function equipWeapon(id) {
  if (!ownedWeapons.includes(id)) ownedWeapons.push(id);
  currentWeaponId = id;
  weaponRig.equip(WEAPONS[id]);
  hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, WEAPONS[id].name);
}

function cycleWeapon() {
  if (ownedWeapons.length < 2) return;
  const index = ownedWeapons.indexOf(currentWeaponId);
  equipWeapon(ownedWeapons[(index + 1) % ownedWeapons.length]);
  audio.click();
}

// -- the player's shot: a hitscan ray per pellet, with spread, recoil and a tracer.
function playerShoot() {
  if (!weaponRig.canFire()) return;
  if (!weaponRig.takeRound()) return;
  const def = weaponRig.def;
  const pellets = def.pellets || 1;
  for (let p = 0; p < pellets; p += 1) {
    camera.getWorldDirection(direction);
    const spread = weaponRig.spread(player.groundSpeed());
    direction.x += (random() * 2 - 1) * spread;
    direction.y += (random() * 2 - 1) * spread;
    direction.z += (random() * 2 - 1) * spread;
    direction.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, direction);
    raycaster.far = def.range;
    const targets = world.shootables.concat(bots.hitMeshes);
    const hit = raycaster.intersectObjects(targets, false)[0];
    const muzzle = _tmp.copy(camera.position).addScaledVector(direction, 0.6);
    if (hit) {
      spawnTracer(muzzle, hit.point, !!hit.object.userData.bot);
      if (hit.object.userData.bot) {
        const bot = hit.object.userData.bot;
        const isHead = hit.object.userData.part === 'head';
        damageCharacter(botChars.get(bot.id), def.damage * (isHead ? def.headMult : 1), isHead, playerChar);
        hud.hitMarker(!bot.alive, 120);
        audio.hit();
      } else {
        spawnImpact(hit.point);
      }
    } else {
      spawnTracer(muzzle, _tmp2.copy(camera.position).addScaledVector(direction, def.range), false);
    }
  }
  weaponRig.pullTrigger();
  player.recoil(def.recoilPitch + random() * 0.004, (random() * 2 - 1) * def.recoilYaw);
  hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, def.name);
  bots.alert(camera.position);
}

function throwGrenade() {
  if (grenades <= 0 || br.state.phase !== 'live' || !playerChar.alive) return;
  grenades -= 1;
  camera.getWorldDirection(direction);
  const origin = _tmp.copy(camera.position).addScaledVector(direction, 0.5);
  origin.y -= 0.1;
  grenade.throwFrom(origin, direction);
  audio.grenadeThrow();
}

function explodeGrenade() {
  const pos = grenade.position;
  audio.explosion();
  spawnImpact(pos);
  const all = [playerChar, ...bots.bots.map((b) => botChars.get(b.id))];
  for (const target of all) {
    if (!target.alive) continue;
    const center = target === playerChar
      ? _tmp.set(player.state.position.x, player.state.position.y + 0.9, player.state.position.z)
      : _tmp.set(target.bot.mover.state.position.x, target.bot.mover.state.position.y + 0.9, target.bot.mover.state.position.z);
    const dist = center.distanceTo(pos);
    if (dist > 6) continue;
    if (!lineOfSight(pos, center)) continue;
    const dmg = Math.round(120 * (1 - dist / 6));
    if (dmg > 0) damageCharacter(target, dmg, false, playerChar);
  }
  if (camera.position.distanceTo(pos) < 10) {
    player.recoil(0.05, 0);
  }
}


// -- HUD wiring: play, pause, and the keys that act on a press.
hud.onPlay(() => {
  if (shot) return;
  audio.resume();
  if (br.state.matchOver || br.state.phase === 'over') {
    location.reload();
    return;
  }
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (br.state.phase !== 'over') {
    hud.showOverlay('paused');
  }
}

function syncCamera() {
  camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - player.state.position.x;
  const dy = point.y - (player.state.position.y + player.state.eye);
  const dz = point.z - player.state.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  player.state.yaw = Math.atan2(-dx, -dz);
  player.state.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

// -- the fixed-step simulation.
function step(dt) {
  elapsed += dt;
  br.update(dt);
  if (br.state.phase === 'drop') {
    dropTimer -= dt;
    if (dropTimer <= 0) {
      br.setLive();
      hud.showBanner('Go!', 'Last one alive wins — loot up and watch the zone', 1800);
      audio.roundStart();
    }
    return;
  }
  if (br.state.phase !== 'live') return;

  // Blue zone: tick it, then hurt everyone standing outside it.
  zone.update(dt);
  const zoneState = zone.getState();
  const playerDps = zone.damageAt(player.state.position.x, player.state.position.z);
  if (playerChar.alive && playerDps > 0) {
    playerHealth = Math.max(0, playerHealth - playerDps * dt);
    hud.setHealth(playerHealth, MAX_HEALTH);
    if (elapsed - lastZoneFlashAt > 0.6) {
      hud.damageFlash();
      lastZoneFlashAt = elapsed;
    }
    if (playerHealth <= 0) killPlayer('The zone');
  }
  for (const bot of botList) {
    if (!bot.alive) continue;
    const dps = zone.damageAt(bot.mover.state.position.x, bot.mover.state.position.z);
    if (dps <= 0) continue;
    bot.health -= dps * dt;
    if (bot.health <= 0) {
      bot.alive = false;
      bot.health = 0;
      hud.killfeed(`${bot.name} died to the zone`);
      br.onEliminated(bot.name, false);
      checkMatchEnd();
    }
  }
  if (br.state.phase !== 'live') return;

  // Healing channel: moving or firing cancels it.
  if (playerChar.alive) {
    if (player.groundSpeed() > 0.5 || input.state.firing) heal.cancel();
    const healEvent = heal.update(dt, () => playerHealth, MAX_HEALTH);
    if (healEvent && healEvent.done) {
      // onComplete already applied the heal; refresh the boost bar.
      hud.setBoost(heal.getBoost());
    }
    hud.setBoost(heal.getBoost());
  }

  if (playerChar.alive) {
    player.step(dt, input.state.keys);
    // Loot prompt: what is at the player's feet.
    const near = loot.nearestPickup(player.state.position, 2.2);
    hud.setLootPrompt(near ? describePickup(near) : null);
    // Grenade.
    if (grenade.active && grenade.step(dt)) explodeGrenade();
  }
  bots.update(dt, elapsed, botCtx);
  weaponRig.step(dt);
  loot.update(dt);
  // Tracers and impacts fade.
  for (const t of tracers) {
    if (t.life > 0) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.85;
    }
  }
  for (const imp of impacts) {
    if (imp.life > 0) {
      imp.life -= dt;
      imp.mesh.scale.setScalar(0.5 + (0.4 - imp.life) * 2.4);
      imp.mesh.material.opacity = Math.max(0, imp.life / 0.4) * 0.85;
      if (imp.life <= 0) imp.mesh.visible = false;
    }
  }
  // HUD: zone + minimap + compass.
  hud.setZone(zoneState.phase + 1, zoneState.timer, zoneState.phaseState);
  hud.setZoneOutside(playerDps > 0);
  minimapTick += 1;
  if (minimapTick % 3 === 0) {
    hud.drawMinimap(player.state.position, player.state.yaw, zoneState, MAP);
    hud.setCompass(player.state.yaw);
  }
}

function handlePressed() {
  for (const code of input.takePressed()) {
    if (!playerChar.alive) continue;
    if (br.state.phase !== 'live') continue;
    if (code === 'KeyR') weaponRig.reload();
    else if (code === 'KeyQ') cycleWeapon();
    else if (code === 'KeyG') throwGrenade();
    else if (code === 'KeyE') {
      const near = loot.nearestPickup(player.state.position, 2.2);
      if (near) applyPickup(near);
    } else if (code === 'Digit4') useHeal('bandage');
    else if (code === 'Digit5') useHeal('medkit');
    else if (code === 'Digit6') useHeal('drink');
  }
}

let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (playerChar.alive && input.state.locked) player.look(look.x, look.y);
    handlePressed();
    // If the pointer lock did not come back (the browser enforces a short cooldown
    // after it is released), show the pause overlay so the player can click to resume.
    if (started && !input.state.locked && hud.isOverlayHidden() && br.state.phase !== 'over' && !shot) {
      hud.showOverlay('paused');
    }
    const def = weaponRig.def;
    if (input.state.firing && playerChar.alive && br.state.phase === 'live' && (def.auto || input.state.firing)) {
      if (weaponRig.canFire()) playerShoot();
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    // Scope: right mouse on the sniper narrows the field of view.
    const targetFov = input.state.aiming && currentWeaponId === 'sniper' ? 30 : 74;
    if (Math.abs(camera.fov - targetFov) > 0.5) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
      camera.updateProjectionMatrix();
    }
    hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, def.name);
    hud.setCrosshairSpread(4 + weaponRig.spread(player.groundSpeed()) * 900);
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

// -- deterministic captures: each ?shot= sets up one frame, renders it twice, freezes.
function runShot(name) {
  hud.hideOverlay();
  if (name === 'start') {
    player.state.position.set(dropOrder[0].x, 0, dropOrder[0].z);
    player.state.yaw = Math.PI;
    player.state.pitch = 0;
    settle(20);
    aimAt(new THREE.Vector3(0, 1.4, -8));
    hud.setHealth(MAX_HEALTH, MAX_HEALTH);
    hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, WEAPONS.pistol.name);
    hud.setAlive(TOTAL_PLAYERS, TOTAL_PLAYERS);
    hud.setZone(1, zone.state.timer, zone.state.phaseState);
    hud.drawMinimap(player.state.position, player.state.yaw, zone.getState(), MAP);
    hud.setCompass(player.state.yaw);
    hud.showOverlay('start');
    paintTwiceThenReady();
    return;
  }
  if (name === 'loot') {
    br.state.phase = 'live';
    br.state.matchTime = 45;
    const weaponPickup = loot.pickups.find((p) => p.kind === 'weapon' && !p.taken);
    if (weaponPickup) {
      player.state.position.set(weaponPickup.pos.x + 1.2, 0, weaponPickup.pos.z + 1.2);
      player.state.yaw = Math.PI;
      settle(12);
      aimAt(new THREE.Vector3(weaponPickup.pos.x, 0.4, weaponPickup.pos.z));
      hud.setLootPrompt(describePickup(weaponPickup));
    } else {
      player.state.position.set(0, 0, 8);
      player.state.yaw = Math.PI;
      settle(12);
    }
    hud.setHealth(100, MAX_HEALTH);
    hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, WEAPONS.pistol.name);
    hud.setAlive(9, TOTAL_PLAYERS);
    hud.setZone(1, zone.state.timer, zone.state.phaseState);
    hud.setHeals(2, 1, 0);
    hud.drawMinimap(player.state.position, player.state.yaw, zone.getState(), MAP);
    hud.setCompass(player.state.yaw);
    paintTwiceThenReady();
    return;
  }
  if (name === 'play' || name === 'end') {
    br.state.phase = 'live';
    br.state.matchTime = 62;
    equipWeapon('rifle');
    player.state.position.set(-2, 0, 8);
    player.state.yaw = Math.PI;
    player.state.pitch = 0;
    const bot = botList[0];
    bot.mover.state.position.set(-3.5, 0, 1);
    bot.mover.state.yaw = 0;
    bot.parts.group.position.copy(bot.mover.state.position);
    bot.parts.group.rotation.y = 0;
    settle(12);
    aimAt(new THREE.Vector3(-3.5, 1.15, 1));
    if (name === 'play') {
      playerShoot();
      settle(1);
      hud.setHealth(100, MAX_HEALTH);
      hud.setAlive(11, TOTAL_PLAYERS);
      hud.setZone(1, zone.state.timer, zone.state.phaseState);
      hud.setHeals(1, 0, 1);
    } else {
      hud.setHealth(100, MAX_HEALTH);
      hud.setAlive(1, TOTAL_PLAYERS);
      hud.setZone(4, 0, 'done');
      hud.setHeals(0, 0, 0);
      br.endMatch('You', true, 1);
      hud.showMatchEnd(1, 'You', true);
    }
    hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, WEAPONS.rifle.name);
    hud.drawMinimap(player.state.position, player.state.yaw, zone.getState(), MAP);
    hud.setCompass(player.state.yaw);
    paintTwiceThenReady();
    return;
  }
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug hook for automated playtests (not used by the game itself).
window.__dustline = {
  br, zone, loot, heal: () => heal, bots, player, playerChar, world,
  get health() { return playerHealth; },
  get armor() { return playerArmor; },
  get alive() { return br.state.alive; },
  get grenades() { return grenades; },
  botPositions() { return bots.bots.map((b) => ({ name: b.name, x: +b.mover.state.position.x.toFixed(2), z: +b.mover.state.position.z.toFixed(2), alive: b.alive, health: Math.round(b.health), weapon: b.weaponId })); },
};

// -- boot.
resetMatch();
br.startMatch();
hud.setHealth(MAX_HEALTH, MAX_HEALTH);
hud.setArmor(0);
hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, WEAPONS.pistol.name);
hud.setAlive(TOTAL_PLAYERS, TOTAL_PLAYERS);
hud.setHeals(0, 0, 0);
hud.setBoost(0);
syncCamera();
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
