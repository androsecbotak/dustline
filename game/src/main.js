// DUSTLINE: a round-based tactical FPS. Two teams, short rounds won by eliminating the
// other team or by the bomb, money between rounds to buy weapons, and gunfire where
// accuracy counts more than speed. Boot and the one loop: a fixed 60 Hz simulation
// feeding a render at the display's rate. ?shot=start|play|buy|end with &seed=N sets up
// a deterministic frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, MAP } from './world.js';
import { createInput } from './input.js';
import { createPlayer, STAND_EYE } from './player.js';
import { createWeaponRig, createGrenade, WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createRounds, BUY_ITEMS } from './rounds.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const MAX_HEALTH = 100;
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

// -- characters: the player and every bot, in one shape, so a bot's shot and the
// player's shot resolve against the same code.
const playerChar = {
  id: 0, team: 'vanguard', name: 'You', alive: true,
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
let ownedWeapons = ['pistol'];
let currentWeaponId = 'pistol';
let started = false;
let frozen = false;
let elapsed = 0;
let buyOpen = false;
let plantTimer = 0;
let lastShotAt = 0;

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

// -- the bomb: a small dark case with an amber light, carried, dropped or planted.
const bombMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.34, 0.2, 0.24),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.metal), roughness: 0.5, metalness: 0.5 }),
);
const bombLight = new THREE.Mesh(
  new THREE.SphereGeometry(0.05, 8, 6),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
);
bombLight.position.set(0, 0.13, 0);
bombMesh.add(bombLight);
bombMesh.visible = false;
bombMesh.castShadow = true;
scene.add(bombMesh);
let bombBlink = 0;


// -- bots: two Vanguard teammates (attackers) and four Crimson defenders.
const bots = createBots(scene, world, {});
const friendlyNames = ['Falcon', 'Havoc'];
const enemyNames = ['Viper', 'Reaper', 'Ghost', 'Onyx'];
const friendlies = [];
const enemies = [];
for (let i = 0; i < 2; i += 1) {
  const bot = bots.spawn('vanguard', 'attack', MAP.spawns.vanguard[i], friendlyNames[i]);
  friendlies.push(bot);
}
for (let i = 0; i < 4; i += 1) {
  const bot = bots.spawn('crimson', i < 2 ? 'defendA' : 'defendB', MAP.spawns.crimson[i % 3], enemyNames[i]);
  enemies.push(bot);
}
bots.setPatrol(enemies[0], [new THREE.Vector3(-16, 0, -10), new THREE.Vector3(-14, 0, -9), new THREE.Vector3(-18, 0, -11)]);
bots.setPatrol(enemies[1], [new THREE.Vector3(-16, 0, -5), new THREE.Vector3(-14, 0, -9), new THREE.Vector3(-16, 0, -10)]);
bots.setPatrol(enemies[2], [new THREE.Vector3(16, 0, -10), new THREE.Vector3(14, 0, -9), new THREE.Vector3(18, 0, -11)]);
bots.setPatrol(enemies[3], [new THREE.Vector3(16, 0, -5), new THREE.Vector3(14, 0, -9), new THREE.Vector3(16, 0, -10)]);

// A bot's view of a character: the same shape as the player, so the same code resolves
// a shot against either.
function botChar(bot) {
  return {
    id: bot.id, team: bot.team, name: bot.name, bot,
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

function enemiesOf(bot) {
  if (bot.team === 'crimson') {
    const list = [];
    if (playerChar.alive) list.push(playerChar);
    for (const f of friendlies) if (f.alive) list.push(botChars.get(f.id));
    return list;
  }
  const list = [];
  for (const e of enemies) if (e.alive) list.push(botChars.get(e.id));
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

// -- damage: armour absorbs half until it is gone, then health. A kill pays money,
// feeds the kill feed, and can end the round by elimination.
function damageCharacter(target, amount, isHead, attacker) {
  if (!target.alive) return;
  const finalAmount = Math.round(amount);
  if (target === playerChar) {
    let remaining = finalAmount;
    const armor = rounds.state.armor;
    if (armor > 0) {
      const absorbed = Math.min(armor, Math.round(remaining * 0.5));
      rounds.state.armor -= absorbed;
      remaining -= absorbed;
    }
    playerHealth = Math.max(0, playerHealth - remaining);
    hud.setHealth(playerHealth, MAX_HEALTH);
    hud.setArmor(rounds.state.armor);
    hud.damageFlash();
    audio.hurt();
    if (playerHealth <= 0) {
      playerChar.alive = false;
      if (rounds.state.bombCarrier === 'player') {
        rounds.dropBomb(player.state.position);
        bombMesh.position.copy(player.state.position);
        bombMesh.position.y = 0.12;
        bombMesh.visible = true;
      }
      hud.showBanner('You were eliminated', 'Your team fights on — the round continues', 4000);
      if (document.pointerLockElement) document.exitPointerLock();
      checkElimination();
    }
    return;
  }
  const bot = target.bot;
  bot.health -= finalAmount;
  if (bot.health > 0) {
    if (attacker) bot.target = attacker === playerChar ? playerChar : botChars.get(attacker.id);
    return;
  }
  bot.alive = false;
  bot.health = 0;
  const killer = attacker === playerChar ? 'You' : (attacker ? attacker.name : 'Unknown');
  hud.killfeed(`${killer} ▸ ${bot.name}${isHead ? '  (headshot)' : ''}`);
  if (attacker === playerChar) {
    rounds.onKill();
    hud.setMoney(rounds.state.money);
    audio.kill();
  }
  if (bot.hasBomb) {
    bot.hasBomb = false;
    rounds.dropBomb(bot.mover.state.position);
    bombMesh.position.copy(bot.mover.state.position);
    bombMesh.position.y = 0.12;
    bombMesh.visible = true;
  }
  checkElimination();
}

function checkElimination() {
  if (rounds.state.phase !== 'live') return;
  const vanguardAlive = (playerChar.alive ? 1 : 0) + bots.aliveCount('vanguard');
  const crimsonAlive = bots.aliveCount('crimson');
  if (vanguardAlive === 0) rounds.endRound('crimson', 'elimination');
  else if (crimsonAlive === 0) rounds.endRound('vanguard', 'elimination');
}

// -- the bots' context: everything their AI needs from the rest of the game.
const botCtx = {
  enemiesOf,
  lineOfSight,
  damage: damageCharacter,
  tracer(from, to, hit) { spawnTracer(from, to, hit); },
  impact(point) { spawnImpact(point); },
  sound(kind) { audio.shoot(kind); },
  get bombPlanted() { return rounds.state.bombPlanted; },
  get plantedSite() { return rounds.state.bombSite ? new THREE.Vector3(rounds.state.bombSite.x, 0, rounds.state.bombSite.z) : null; },
  bombSiteFor(bot) {
    if (!bot.hasBomb) return null;
    return attackSite.clone();
  },
  attackSiteFor(bot) {
    return attackSite.clone();
  },
  plantProgress(bot, frac) {
    hud.setBomb(`Planting the bomb… ${Math.round(frac * 100)}%`, false);
  },
  defuseProgress(bot, frac) {
    hud.setBomb(`Crimson is defusing the bomb… ${Math.round(frac * 100)}%`, true);
  },
  plantBomb(site, bot) {
    rounds.plantBomb(site);
  },
  defuseBomb(bot) {
    rounds.defuseBomb();
  },
};
let attackSite = MAP.sites.A.clone();

const rounds = createRounds({
  onRoundStart(round) {
    hud.showBanner(`ROUND ${round}`, round === 1 ? 'Buy your gear — press B' : 'Buy your gear — press B', 2400);
    hud.setScore(rounds.state.vanguardWins, rounds.state.crimsonWins, round);
    audio.roundStart();
  },
  onLive() {
    hud.hideBuy();
    buyOpen = false;
    hud.showBanner('Go!', 'Plant the bomb at A or B', 1400);
  },
  onRoundEnd(winner, reason, st) {
    const reasonText = { elimination: 'team eliminated', bomb: 'bomb detonated', defuse: 'bomb defused', time: 'time expired' }[reason] || reason;
    hud.showBanner(
      winner === 'vanguard' ? 'VANGUARD WINS THE ROUND' : 'CRIMSON WINS THE ROUND',
      `${reasonText}  ·  Vanguard ${st.vanguardWins} — ${st.crimsonWins} Crimson`,
      4200,
    );
    hud.setScore(st.vanguardWins, st.crimsonWins, st.round);
    hud.setMoney(st.money);
    if (winner === 'vanguard') audio.roundWin();
    else audio.roundLose();
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onMatchEnd(winner, st) {
    const text = winner === 'vanguard'
      ? `Vanguard takes the match ${st.vanguardWins} — ${st.crimsonWins}.`
      : `Crimson takes the match ${st.crimsonWins} — ${st.vanguardWins}.`;
    hud.showOverlay('matchEnd', text);
  },
  onResetRound() {
    resetRound();
  },
  onBombPlanted(site) {
    bombMesh.visible = true;
    bombMesh.position.set(site.x, 0.12, site.z);
    audio.bombPlant();
    hud.killfeed('Bomb planted — defend it!');
  },
  onBombDefused() {
    bombMesh.visible = false;
    audio.bombDefuse();
  },
  onBuyWeapon(itemId) {
    equipWeapon(itemId);
  },
  onBuy(item, money) {
    hud.setMoney(money);
    hud.buyResult(`${item.name} bought.`);
    audio.buy();
  },
});

function resetRound() {
  playerHealth = MAX_HEALTH;
  playerChar.alive = true;
  player.state.position.set(0, 0, 15);
  player.state.velocity.set(0, 0, 0);
  player.state.yaw = 0;
  player.state.pitch = 0;
  attackSite = random() < 0.5 ? MAP.sites.A.clone() : MAP.sites.B.clone();
  bots.resetRound(MAP.spawns);
  for (const bot of friendlies) bot.hasBomb = false;
  if (rounds.state.bombCarrier === 'player') {
    bombMesh.visible = false;
  }
  weaponRig.refillAmmo();
  hud.setHealth(playerHealth, MAX_HEALTH);
  hud.setArmor(rounds.state.armor);
  hud.setGrenades(rounds.state.grenades);
  hud.setBomb('Plant the bomb at A or B', false);
  syncCamera();
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

// -- the player's shot: a hitscan ray with spread, recoil and a tracer.
function playerShoot() {
  if (!weaponRig.canFire()) return;
  if (!weaponRig.takeRound()) return;
  const def = weaponRig.def;
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
  weaponRig.pullTrigger();
  player.recoil(def.recoilPitch + random() * 0.004, (random() * 2 - 1) * def.recoilYaw);
  hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, def.name);
  bots.alert(camera.position);
  lastShotAt = elapsed;
}

function throwGrenade() {
  if (rounds.state.grenades <= 0 || (rounds.state.phase !== 'live' && rounds.state.phase !== 'buy') || !playerChar.alive) return;
  rounds.state.grenades -= 1;
  hud.setGrenades(rounds.state.grenades);
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


// -- HUD wiring: play, pause, buy, and the keys that act on a press.
hud.onPlay(() => {
  if (shot) return;
  audio.resume();
  if (rounds.state.matchOver) {
    location.reload();
    return;
  }
  if (rounds.state.phase === 'over') {
    rounds.nextRound();
    input.requestLock();
    return;
  }
  input.requestLock();
});
hud.onBuy((itemId) => {
  const result = rounds.buy(itemId);
  if (!result.ok) hud.buyResult(result.reason);
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.hideBuy();
    buyOpen = false;
  } else if (!rounds.state.matchOver) {
    if (buyOpen) return;
    hud.showOverlay(rounds.state.phase === 'over' ? 'roundEnd' : 'paused', rounds.state.phase === 'over' ? `Vanguard ${rounds.state.vanguardWins} — ${rounds.state.crimsonWins} Crimson. Click for the next round.` : undefined);
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
  rounds.update(dt);
  if ((rounds.state.phase === 'live' || rounds.state.phase === 'buy') && playerChar.alive) {
    player.step(dt, input.state.keys);
    // Bomb pickup: a friendly bot walking over the dropped bomb takes it.
    if (rounds.state.bombCarrier === 'dropped' && rounds.state.bombDroppedAt) {
      for (const bot of friendlies) {
        if (bot.alive && bot.mover.state.position.distanceTo(rounds.state.bombDroppedAt) < 1.2) {
          if (rounds.pickupBomb('bot')) {
            bot.hasBomb = true;
            bombMesh.visible = false;
            hud.killfeed(`${bot.name} picked up the bomb`);
          }
          break;
        }
      }
    }
    // Planting: hold E near a site while carrying the bomb.
    if (rounds.state.bombCarrier === 'player' && !rounds.state.bombPlanted) {
      const nearA = player.state.position.distanceTo(MAP.sites.A) < 2.5;
      const nearB = player.state.position.distanceTo(MAP.sites.B) < 2.5;
      if ((nearA || nearB) && input.state.keys.has('KeyE')) {
        plantTimer += dt;
        hud.setBomb(`Planting the bomb… ${Math.round((plantTimer / 3) * 100)}%`, false);
        if (plantTimer >= 3) {
          rounds.plantBomb(nearA ? MAP.sites.A.clone() : MAP.sites.B.clone());
          plantTimer = 0;
        }
      } else {
        plantTimer = 0;
        if (!rounds.state.bombPlanted) hud.setBomb('Plant the bomb at A or B', false);
      }
    }
    // Grenade.
    if (grenade.active && grenade.step(dt)) explodeGrenade();
  }
  bots.update(dt, elapsed, botCtx);
  weaponRig.step(dt);
  // Bomb blink while planted; the ticker beeps every second.
  if (rounds.state.bombPlanted) {
    bombBlink += dt;
    bombLight.material.color.set(bombBlink % 1 < 0.5 ? new THREE.Color(PALETTE.accent) : new THREE.Color('#7a1a1a'));
    hud.setBomb(`BOMB PLANTED — ${Math.ceil(rounds.state.bombTimer)}s`, rounds.state.bombTimer <= 10);
  }
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
}

function handlePressed() {
  for (const code of input.takePressed()) {
    if (!playerChar.alive) continue;
    if (code === 'KeyR') weaponRig.reload();
    else if (code === 'KeyQ') cycleWeapon();
    else if (code === 'KeyG') throwGrenade();
    else if (code === 'KeyB' && rounds.state.phase === 'buy') {
      buyOpen = !buyOpen;
      if (buyOpen) {
        hud.showBuy(rounds.state.money);
        if (document.pointerLockElement) document.exitPointerLock();
      } else {
        hud.hideBuy();
        input.requestLock();
      }
    } else if (buyOpen && ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(code)) {
      const item = BUY_ITEMS[Number(code.slice(-1)) - 1];
      if (item) {
        const result = rounds.buy(item.id);
        if (!result.ok) hud.buyResult(result.reason);
      }
    }
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
    if (started && !input.state.locked && !buyOpen && hud.isOverlayHidden() && !rounds.state.matchOver && !shot) {
      hud.showOverlay(rounds.state.phase === 'over' ? 'roundEnd' : 'paused', rounds.state.phase === 'over' ? `Vanguard ${rounds.state.vanguardWins} — ${rounds.state.crimsonWins} Crimson. Click for the next round.` : undefined);
    }
    const def = weaponRig.def;
    if (input.state.firing && playerChar.alive && (rounds.state.phase === 'live' || rounds.state.phase === 'buy') && (def.auto || input.state.firing)) {
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
    hud.setTimer(rounds.state.timer);
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
  hud.hideBuy();
  if (name === 'start') {
    player.state.position.set(0.6, 0, 15);
    player.state.yaw = Math.PI;
    player.state.pitch = 0;
    settle(20);
    aimAt(new THREE.Vector3(-8, 1.4, -8));
    hud.setScore(0, 0, 1);
    hud.setMoney(800);
    hud.setHealth(MAX_HEALTH, MAX_HEALTH);
    hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, WEAPONS.pistol.name);
    hud.showOverlay('start');
    paintTwiceThenReady();
    return;
  }
  if (name === 'buy') {
    player.state.position.set(0.6, 0, 15);
    player.state.yaw = Math.PI;
    settle(20);
    hud.setMoney(4750);
    hud.showBuy(4750);
    paintTwiceThenReady();
    return;
  }
  if (name === 'play' || name === 'end') {
    rounds.state.phase = 'live';
    rounds.state.timer = 62;
    rounds.state.round = 2;
    rounds.state.vanguardWins = 1;
    rounds.state.crimsonWins = 0;
    equipWeapon('rifle');
    player.state.position.set(-2, 0, 8);
    player.state.yaw = Math.PI;
    player.state.pitch = 0;
    const bot = enemies[0];
    bot.mover.state.position.set(-3.5, 0, 1);
    bot.mover.state.yaw = 0;
    bot.parts.group.position.copy(bot.mover.state.position);
    bot.parts.group.rotation.y = 0;
    settle(12);
    aimAt(new THREE.Vector3(-3.5, 1.15, 1));
    if (name === 'play') {
      playerShoot();
      settle(1);
      hud.setScore(1, 0, 2);
      hud.setMoney(1100);
      hud.setHealth(100, MAX_HEALTH);
      hud.setTimer(62);
      hud.setBomb('Plant the bomb at A or B', false);
    } else {
      rounds.state.vanguardWins = 2;
      rounds.state.crimsonWins = 1;
      hud.setScore(2, 1, 3);
      hud.setMoney(4350);
      hud.setHealth(62, MAX_HEALTH);
      hud.setTimer(0);
      hud.showBanner('VANGUARD WINS THE ROUND', 'team eliminated  ·  Vanguard 2 — 1 Crimson', 60000);
    }
    hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, WEAPONS.rifle.name);
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
  rounds, bots, player, playerChar, world,
  get health() { return playerHealth; },
  get money() { return rounds.state.money; },
  botPositions() { return bots.bots.map((b) => ({ name: b.name, team: b.team, x: +b.mover.state.position.x.toFixed(2), z: +b.mover.state.position.z.toFixed(2), alive: b.alive, health: b.health })); },
};

// -- boot.
resetRound();
rounds.startRound();
hud.setHealth(MAX_HEALTH, MAX_HEALTH);
hud.setArmor(0);
hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, WEAPONS.pistol.name);
hud.setScore(0, 0, 1);
hud.setMoney(rounds.state.money);
hud.setGrenades(0);
hud.setTimer(rounds.state.timer);
syncCamera();
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
