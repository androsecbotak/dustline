// DUSTLINE v3: a round-based tactical FPS. Two teams of five, short rounds won by
// eliminating the other team or by the bomb, money between rounds to buy weapons,
// and gunfire where accuracy counts more than speed. Rounds 1–6 Vanguard attacks
// and Crimson defends; at halftime (round 7) the sides swap, so the player
// defends and can defuse (a defuse kit halves their defuse time). Boot and the
// one loop: a fixed 60 Hz simulation feeding a render at the display's rate.
// ?shot=start|play|buy|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, MAP, locationAt } from './world.js';
import { createInput } from './input.js';
import { createPlayer, STAND_EYE } from './player.js';
import { createWeaponRig, createGrenade, WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { createBots, VANGUARD_NAMES, CRIMSON_NAMES } from './bots.js';
import { createRounds, BUY_ITEMS, PLANT_SECONDS, DEFUSE_SECONDS } from './rounds.js';
import { createHeal } from './heal.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const MAX_HEALTH = 100;
const TOTAL_PLAYERS = 10;
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
const heal = createHeal();
const raycaster = new THREE.Raycaster();
raycaster.far = 100;
const direction = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();

// -- HUD compatibility: hud.js is owned by the polish worker and its v2 build does
// not have the rounds methods yet (showBuy, setScore, setMoney, setBomb,
// setGrenades, buyResult, onBuy). Call them when they exist; otherwise update the
// rounds DOM (#score-value, #money-value, #bomb-status, #buy-menu, ...) directly
// from here. Once hud.js restores the v1 methods the fallbacks go quiet.
function hudCall(name, ...args) {
  const fn = hud[name];
  if (typeof fn !== 'function') return false;
  try {
    fn.apply(hud, args);
    return true;
  } catch (e) {
    return false;
  }
}
function hudShowBuy(money) {
  // Second arg: the defuse kit is most relevant while the player's team defends.
  if (hudCall('showBuy', money, rounds.state.attackingTeam === 'crimson')) return;
  renderBuyMenuFallback();
  const menu = document.getElementById('buy-menu');
  if (menu) menu.hidden = false;
  const buyMoney = document.getElementById('buy-money');
  if (buyMoney) buyMoney.textContent = `$${money}`;
}
function hudHideBuy() {
  if (hudCall('hideBuy')) return;
  const menu = document.getElementById('buy-menu');
  if (menu) menu.hidden = true;
}
function hudSetScore(vanguard, crimson, round) {
  if (hudCall('setScore', vanguard, crimson, round)) return;
  const score = document.getElementById('score-value');
  if (score) score.textContent = `${vanguard} — ${crimson}`;
  const roundEl = document.getElementById('round-value');
  if (roundEl) roundEl.textContent = `ROUND ${round}`;
}
function hudSetMoney(money) {
  if (hudCall('setMoney', money)) return;
  const moneyEl = document.getElementById('money-value');
  if (moneyEl) moneyEl.textContent = `$${money}`;
  const buyMoney = document.getElementById('buy-money');
  if (buyMoney) buyMoney.textContent = `$${money}`;
}
function hudSetGrenades() {
  // The HUD shows all three grenade counts; rounds.state.grenadeCounts is
  // the source of truth (frag kept in sync with rounds.state.grenades).
  if (hudCall('setGrenades', rounds.state.grenadeCounts)) return;
  const el = document.getElementById('grenade-value');
  if (el) el.textContent = rounds.state.grenadeCounts.frag > 0 ? `◉ ${rounds.state.grenadeCounts.frag}` : '';
}
function hudSetBomb(text, urgent) {
  if (hudCall('setBomb', text, urgent)) return;
  const el = document.getElementById('bomb-status');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('urgent', !!urgent);
  el.style.display = text ? 'block' : 'none';
}
function hudBuyResult(message) {
  if (hudCall('buyResult', message)) return;
  const el = document.getElementById('buy-message');
  if (el) el.textContent = message || '';
}
// The buy menu rows, built once from BUY_ITEMS, used only while hud.js has no
// showBuy of its own. Clicking a row buys exactly like pressing its number key.
let buyMenuFallbackBuilt = false;
function renderBuyMenuFallback() {
  if (buyMenuFallbackBuilt) return;
  const itemsEl = document.getElementById('buy-items');
  if (!itemsEl) return;
  for (const item of BUY_ITEMS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'buy-item';
    button.dataset.item = item.id;
    button.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
    button.addEventListener('click', () => buyItem(item.id));
    itemsEl.appendChild(button);
  }
  buyMenuFallbackBuilt = true;
}
function showOverlay(mode, extra) {
  // v2's hud only knows start/paused/matchEnd; a rounds 'roundEnd' falls back
  // to the pause overlay carrying the round score.
  try {
    hud.showOverlay(mode, extra);
  } catch (e) {
    if (mode !== 'paused') {
      try { hud.showOverlay('paused', extra); } catch (e2) { /* overlay unavailable */ }
    }
  }
}

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
let botPlantTimer = 0;
let botDefuseTimer = 0;
let playerDefuseTimer = 0;
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

// -- teams: Vanguard (player + 4 bots) vs Crimson (5 bots). Rounds 1–6
// Vanguard attacks; after the halftime swap (round 7) Crimson attacks.
// bots.js owns the name pools; the team is assigned here after spawn.
const VANGUARD_SPAWNS = [
  new THREE.Vector3(-9, 0, 15), new THREE.Vector3(-3, 0, 15),
  new THREE.Vector3(3, 0, 15), new THREE.Vector3(9, 0, 15),
];
const CRIMSON_SPAWNS = [
  new THREE.Vector3(-12, 0, -15), new THREE.Vector3(-6, 0, -15),
  new THREE.Vector3(0, 0, -15), new THREE.Vector3(6, 0, -15),
  new THREE.Vector3(12, 0, -15),
];
const bots = createBots(scene, world, { random });
const friendlyNames = VANGUARD_NAMES;
const enemyNames = CRIMSON_NAMES;
const friendlies = [];
const enemies = [];
for (let i = 0; i < 4; i += 1) {
  const bot = bots.spawn(friendlyNames[i], VANGUARD_SPAWNS[i].clone(), 'rifle');
  bot.team = 'vanguard';
  bot.hasBomb = false;
  friendlies.push(bot);
}
for (let i = 0; i < 5; i += 1) {
  const bot = bots.spawn(enemyNames[i], CRIMSON_SPAWNS[i].clone(), 'rifle');
  bot.team = 'crimson';
  bot.hasBomb = false;
  enemies.push(bot);
}

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

function aliveCount(team) {
  if (team === 'vanguard') {
    return (playerChar.alive ? 1 : 0) + friendlies.filter((b) => b.alive).length;
  }
  return enemies.filter((b) => b.alive).length;
}

// Combatant positions for the circular minimap (player + all bots).
function minimapCombatants() {
  const list = [{
    x: player.state.position.x, z: player.state.position.z,
    team: 'vanguard', alive: playerChar.alive, isPlayer: true,
  }];
  for (const bot of bots.bots) {
    list.push({
      x: bot.mover.state.position.x, z: bot.mover.state.position.z,
      team: bot.team, alive: bot.alive, isPlayer: false,
    });
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

// -- match events + stats: hooks the polish worker wires to the HUD (kill feed,
// radio lines, scoreboard). matchEvents.onKill / onRadio are plain callbacks the
// polish worker assigns; main.js only invokes them.
const matchEvents = {
  onKill: null,
  onRadio: null,
};
function radio(text) {
  if (typeof matchEvents.onRadio === 'function') matchEvents.onRadio(text);
}
// Wire the HUD to the match hooks: kills go to the kill feed (with weapon
// and headshot), radio callouts go to the amber radio lines. registerKill()
// invokes onKill instead of writing the feed directly, so each kill feeds
// exactly once.
matchEvents.onKill = (killerName, victimName, weaponName, isHead) => {
  if (typeof hud.feedKill === 'function') hud.feedKill(killerName, victimName, weaponName, isHead);
  else hud.killfeed(`${killerName} ▸ ${victimName}`);
};
matchEvents.onRadio = (text) => {
  if (typeof hud.radio === 'function') hud.radio(text);
  else hud.killfeed(`RADIO: ${text}`);
};

// Per-combatant stats for the scoreboard, keyed by name. Cash is the player's
// money; bots carry no economy.
const matchState = { stats: {} };
function initStats() {
  const all = [{ name: 'You', team: 'vanguard' }];
  for (const b of friendlies) all.push({ name: b.name, team: 'vanguard' });
  for (const b of enemies) all.push({ name: b.name, team: 'crimson' });
  for (const c of all) {
    matchState.stats[c.name] = {
      name: c.name, team: c.team,
      kills: 0, deaths: 0, assists: 0, headshots: 0, shots: 0, damage: 0, cash: 0,
    };
  }
  matchState.stats.You.cash = 800;
}
initStats();
function statOf(char) {
  return matchState.stats[char.name];
}
// Last non-lethal damager per victim, for assists.
const lastDamager = new Map();
function weaponNameOf(char) {
  if (char === playerChar) return WEAPONS[currentWeaponId].name;
  if (char.bot) return (WEAPONS[char.bot.weaponId] || WEAPONS.rifle).name;
  // bots.js passes the raw bot object as the attacker, not the botChar wrapper.
  if (char.weaponId) return (WEAPONS[char.weaponId] || WEAPONS.rifle).name;
  return 'Unknown';
}

// -- damage: armour absorbs half until it is gone, then health. A kill pays money,
// feeds the kill feed, and can end the round by elimination.
function damageCharacter(target, amount, isHead, attacker, weaponName) {
  if (!target.alive) return;
  const finalAmount = Math.round(amount);
  if (attacker && attacker !== target) {
    const st = statOf(attacker);
    if (st) {
      st.damage += finalAmount;
      if (isHead) st.headshots += 1;
    }
  }
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
      const killerName = attacker === playerChar ? 'You' : (attacker ? attacker.name : 'Unknown');
      const killer = attacker === playerChar ? playerChar : attacker;
      registerKill(killer, playerChar, weaponName || (attacker ? weaponNameOf(attacker) : 'Unknown'), isHead);
      if (rounds.state.bombCarrier === 'player') {
        rounds.dropBomb(player.state.position);
        bombMesh.position.copy(player.state.position);
        bombMesh.position.y = 0.12;
        bombMesh.visible = true;
      }
      hud.showBanner('You were eliminated', 'Your team fights on — the round continues', 4000);
      if (document.pointerLockElement) document.exitPointerLock();
      checkElimination();
    } else if (attacker && attacker !== target) {
      lastDamager.set(target, attacker);
    }
    return;
  }
  const bot = target.bot;
  bot.health -= finalAmount;
  if (bot.health > 0) {
    if (attacker) {
      bot.target = attacker === playerChar ? playerChar : botChars.get(attacker.id);
      lastDamager.set(target, attacker);
    }
    return;
  }
  bot.alive = false;
  bot.health = 0;
  const killer = attacker === playerChar ? playerChar : attacker;
  registerKill(killer, target, weaponName || (attacker ? weaponNameOf(attacker) : 'Unknown'), isHead);
  if (attacker === playerChar) {
    rounds.onKill();
    matchState.stats.You.cash = rounds.state.money;
    hudSetMoney(rounds.state.money);
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

function registerKill(killerChar, victimChar, weaponName, isHead) {
  const killerName = killerChar === playerChar ? 'You' : (killerChar ? killerChar.name : 'Unknown');
  const killerStats = killerChar ? statOf(killerChar) : null;
  const victimStats = statOf(victimChar);
  if (killerStats) killerStats.kills += 1;
  if (victimStats) victimStats.deaths += 1;
  const assister = lastDamager.get(victimChar);
  if (assister && assister !== killerChar) {
    const assistStats = statOf(assister);
    if (assistStats) assistStats.assists += 1;
  }
  lastDamager.delete(victimChar);
  if (typeof matchEvents.onKill === 'function') {
    matchEvents.onKill(killerName, victimChar.name, weaponName, isHead);
  }
}

function checkElimination() {
  if (rounds.state.phase !== 'live') return;
  const vanguardAlive = aliveCount('vanguard');
  const crimsonAlive = aliveCount('crimson');
  if (vanguardAlive === 0) rounds.endRound('crimson', 'elimination');
  else if (crimsonAlive === 0) rounds.endRound('vanguard', 'elimination');
}

// -- the bots' context: everything their AI needs from the rest of the game.
// Grenade awareness (smoke blocks sight, flash blinds) and the rounds
// objective (attack site, attacking team, phase) live here; bots.js reads
// them through the getters so nothing goes stale across rounds.
const botCtx = {
  enemiesOf,
  lineOfSight,
  damage: damageCharacter,
  tracer(from, to, hit) { spawnTracer(from, to, hit); },
  impact(point) { spawnImpact(point); },
  sound(kind) { audio.shoot(kind); },
  smokeBlocksLOS(a, b) { return grenade.smokeBlocksLOS(a, b); },
  flashLevelAt(pos, forward, losFn) { return grenade.flashLevelAt(pos, forward, losFn); },
  radio(text) { radio(text); },
  getPhase() { return rounds.state.phase; },
  getAttackingTeam() { return rounds.state.attackingTeam; },
  getAttackSite() { return attackSite; },
  getBombPlanted() { return rounds.state.bombPlanted; },
};
// Flash blindness needs the game's line of sight (registered once; the
// grenade module also accepts it per call from bots.js).
grenade.setLineOfSight(lineOfSight);
let attackSite = MAP.sites.A.clone();

const rounds = createRounds({
  onRoundStart(round) {
    const swapped = round === 7;
    hud.showBanner(`ROUND ${round}`, swapped ? 'Sides swapped — Crimson attacks now. Defuse kit halves your defuse time.' : 'Buy your gear — press B', 2400);
    hudSetScore(rounds.state.vanguardWins, rounds.state.crimsonWins, round);
    audio.roundStart();
  },
  onLive() {
    hudHideBuy();
    buyOpen = false;
    const defending = rounds.state.attackingTeam === 'crimson';
    hud.showBanner('Go!', defending ? 'Stop Crimson planting the bomb' : 'Plant the bomb at A or B', 1400);
    radio(defending ? 'Hold the sites — do not let them plant!' : 'Go go go — plant the bomb!');
  },
  onRoundEnd(winner, reason, st) {
    const reasonText = { elimination: 'team eliminated', bomb: 'bomb detonated', defuse: 'bomb defused', time: 'time expired' }[reason] || reason;
    hud.showBanner(
      winner === 'vanguard' ? 'VANGUARD WINS THE ROUND' : 'CRIMSON WINS THE ROUND',
      `${reasonText}  ·  Vanguard ${st.vanguardWins} — ${st.crimsonWins} Crimson`,
      4200,
    );
    hudSetScore(st.vanguardWins, st.crimsonWins, st.round);
    matchState.stats.You.cash = st.money;
    hudSetMoney(st.money);
    if (winner === 'vanguard') audio.roundWin();
    else audio.roundLose();
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onMatchEnd(winner, st) {
    const text = winner === 'vanguard'
      ? `Vanguard takes the match ${st.vanguardWins} — ${st.crimsonWins}.`
      : `Crimson takes the match ${st.crimsonWins} — ${st.vanguardWins}.`;
    if (typeof hud.showMatchScoreboard === 'function') {
      hud.showMatchScoreboard(winner, st, matchState.stats);
    } else {
      showOverlay('matchEnd', text);
    }
    radio(text);
  },
  onResetRound() {
    resetRound();
  },
  onBombPlanted(site) {
    bombMesh.visible = true;
    bombMesh.position.set(site.x, 0.12, site.z);
    audio.bombPlant();
    hud.killfeed('Bomb planted — defend it!');
    radio(`Bomb planted at ${locationAt(site.x, site.z).name}`);
  },
  onBombDefused() {
    bombMesh.visible = false;
    audio.bombDefuse();
  },
  onBuyWeapon(itemId) {
    equipWeapon(itemId);
  },
  onBuy(item, money) {
    hudSetMoney(money);
    matchState.stats.You.cash = money;
    hudSetGrenades(rounds.state.grenades);
    hud.setArmor(rounds.state.armor);
    hudBuyResult(`${item.name} bought.`);
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
  bots.resetRound([...VANGUARD_SPAWNS, ...CRIMSON_SPAWNS]);
  for (const bot of friendlies) bot.hasBomb = false;
  for (const bot of enemies) bot.hasBomb = false;
  plantTimer = 0;
  botPlantTimer = 0;
  botDefuseTimer = 0;
  playerDefuseTimer = 0;
  lastDamager.clear();
  // Bomb carrier follows the attacking team: the player carries it while
  // Vanguard attacks (rounds 1–6); after halftime a Crimson bot carries it.
  if (rounds.state.attackingTeam === 'crimson') {
    rounds.state.bombCarrier = 'bot';
    enemies[0].hasBomb = true;
  } else {
    rounds.state.bombCarrier = 'player';
  }
  bombMesh.visible = false;
  weaponRig.refillAmmo();
  hud.setHealth(playerHealth, MAX_HEALTH);
  hud.setArmor(rounds.state.armor);
  hudSetGrenades(rounds.state.grenades);
  hudSetBomb(rounds.state.attackingTeam === 'crimson' ? 'Stop Crimson planting the bomb' : 'Plant the bomb at A or B', false);
  hudSetScore(rounds.state.vanguardWins, rounds.state.crimsonWins, rounds.state.round);
  hudSetMoney(rounds.state.money);
  const counts = heal.getCounts();
  hud.setHeals(counts.bandage, counts.medkit, counts.drink);
  hud.setBoost(heal.getBoost());
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

function buyItem(itemId) {
  // No re-buying a weapon already owned (rounds.buy does not know ownership).
  if (WEAPONS[itemId] && ownedWeapons.includes(itemId)) {
    hudBuyResult('Already owned');
    return;
  }
  const result = rounds.buy(itemId);
  if (!result.ok) {
    hudBuyResult(result.reason);
    return;
  }
  // Heals are bought here (Fix 2, purchase route): rounds.buy takes the
  // money; the item goes into the heal inventory, usable with keys 4/5.
  if (itemId === 'bandage' || itemId === 'medkit') {
    heal.add(itemId, 1);
    const counts = heal.getCounts();
    hud.setHeals(counts.bandage, counts.medkit, counts.drink);
  }
  if (typeof hud.noteBought === 'function') hud.noteBought(itemId);
}

// -- the player's shot: a hitscan ray per pellet, with spread, recoil and a tracer.
function playerShoot() {
  if (!weaponRig.canFire()) return;
  if (!weaponRig.takeRound()) return;
  const def = weaponRig.def;
  matchState.stats.You.shots += 1;
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
        damageCharacter(botChars.get(bot.id), def.damage * (isHead ? def.headMult : 1), isHead, playerChar, def.name);
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
  heal.cancel();
  lastShotAt = elapsed;
}

function throwGrenade(type = 'frag') {
  if (rounds.state.phase !== 'live' || !playerChar.alive) return;
  if (!['frag', 'smoke', 'flash'].includes(type)) type = 'frag';
  if (rounds.state.grenadeCounts[type] <= 0) return;
  rounds.state.grenadeCounts[type] -= 1;
  if (type === 'frag') rounds.state.grenades = rounds.state.grenadeCounts.frag;
  hudSetGrenades();
  camera.getWorldDirection(direction);
  const origin = _tmp.copy(camera.position).addScaledVector(direction, 0.5);
  origin.y -= 0.1;
  // throwFrom returns false when the flight pool is full — refund the grenade.
  if (!grenade.throwFrom(origin, direction, type)) {
    rounds.state.grenadeCounts[type] += 1;
    if (type === 'frag') rounds.state.grenades = rounds.state.grenadeCounts.frag;
    hudSetGrenades();
    return;
  }
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
    if (dmg > 0) damageCharacter(target, dmg, false, playerChar, 'Frag Grenade');
  }
  if (camera.position.distanceTo(pos) < 10) {
    player.recoil(0.05, 0);
  }
}

// -- healing: 4 bandage, 5 medkit, 6 energy drink. Moving or firing cancels it.
// (No loot in rounds mode, so the inventory starts empty; the keys stay wired.)
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
  if (!playerChar.alive || rounds.state.phase !== 'live') return;
  const result = heal.startUse(item, () => playerHealth, MAX_HEALTH, heal.boostHealMultiplier());
  if (!result.ok) {
    const reason = { 'none left': `No ${item}s left`, 'already healing': 'Already healing…', 'already full': 'Health already full' }[result.reason] || result.reason;
    hud.showBanner(reason, '', 1400);
    return;
  }
  hud.setHeals(heal.getCounts().bandage, heal.getCounts().medkit, heal.getCounts().drink);
  hud.showBanner(`Using ${item}…`, 'Keep still — moving or firing cancels it', 1600);
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
if (typeof hud.onBuy === 'function') {
  hud.onBuy((itemId) => buyItem(itemId));
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hudHideBuy();
    buyOpen = false;
  } else if (!rounds.state.matchOver) {
    if (buyOpen) return;
    showOverlay(rounds.state.phase === 'over' ? 'roundEnd' : 'paused', rounds.state.phase === 'over' ? `Vanguard ${rounds.state.vanguardWins} — ${rounds.state.crimsonWins} Crimson. Click for the next round.` : undefined);
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
  if (rounds.state.phase === 'buy') {
    // Buy time: everyone holds position; the player cannot move or shoot.
    weaponRig.step(dt);
    return;
  }
  if (rounds.state.phase !== 'live') {
    // Round over: the timer runs to the next round; nothing else simulates.
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.85;
      }
    }
    return;
  }

  // Healing channel: moving or firing cancels it.
  if (playerChar.alive) {
    if (player.groundSpeed() > 0.5 || input.state.firing) heal.cancel();
    const healEvent = heal.update(dt, () => playerHealth, MAX_HEALTH);
    if (healEvent && healEvent.done) {
      hud.setBoost(heal.getBoost());
    }
    hud.setBoost(heal.getBoost());
  }

  // Bomb pickup: an attacking-team bot walking over the dropped bomb takes
  // it. This runs even when the player is dead — the team can still recover
  // the bomb. (When Vanguard attacks the player can also be the carrier; the
  // player picks it up by walking over it — handled by the plant branch
  // below via rounds.state.bombCarrier, which stays 'dropped' until a bot
  // takes it; a live player re-takes it on contact, see the pickup below.)
  if (rounds.state.bombCarrier === 'dropped' && rounds.state.bombDroppedAt) {
    const attackers = rounds.state.attackingTeam === 'vanguard' ? friendlies : enemies;
    for (const bot of attackers) {
      if (bot.alive && bot.mover.state.position.distanceTo(rounds.state.bombDroppedAt) < 1.2) {
        if (rounds.pickupBomb('bot')) {
          bot.hasBomb = true;
          bombMesh.visible = false;
          hud.killfeed(`${bot.name} picked up the bomb`);
          radio(`${bot.name} has the bomb.`);
        }
        break;
      }
    }
    // The player (Vanguard, attacking) re-takes a dropped bomb on contact.
    if (rounds.state.bombCarrier === 'dropped' && rounds.state.attackingTeam === 'vanguard'
      && playerChar.alive && player.state.position.distanceTo(rounds.state.bombDroppedAt) < 1.2) {
      if (rounds.pickupBomb('player')) {
        bombMesh.visible = false;
        hud.killfeed('You picked up the bomb');
      }
    }
  }

  if (playerChar.alive) {
    player.step(dt, input.state.keys);
    // Planting: hold E near a site while carrying the bomb.
    if (rounds.state.bombCarrier === 'player' && !rounds.state.bombPlanted) {
      const nearA = player.state.position.distanceTo(MAP.sites.A) < 2.5;
      const nearB = player.state.position.distanceTo(MAP.sites.B) < 2.5;
      if ((nearA || nearB) && input.state.keys.has('KeyE')) {
        plantTimer += dt;
        hudSetBomb(`Planting the bomb… ${Math.round((plantTimer / PLANT_SECONDS) * 100)}%`, false);
        if (plantTimer >= PLANT_SECONDS) {
          rounds.plantBomb(nearA ? MAP.sites.A.clone() : MAP.sites.B.clone());
          plantTimer = 0;
        }
      } else {
        plantTimer = 0;
        if (!rounds.state.bombPlanted) hudSetBomb(rounds.state.attackingTeam === 'crimson' ? 'Stop Crimson planting the bomb' : 'Plant the bomb at A or B', false);
      }
    }
    // Defusing (halftime onwards, Vanguard defends): hold E at the planted
    // bomb. A defuse kit halves the time (rounds.state.defuseSeconds).
    if (rounds.state.bombPlanted && rounds.state.attackingTeam === 'crimson') {
      if (player.state.position.distanceTo(rounds.state.bombSite) < 2.5 && input.state.keys.has('KeyE')) {
        playerDefuseTimer += dt;
        hudSetBomb(`Defusing the bomb… ${Math.round((playerDefuseTimer / rounds.state.defuseSeconds) * 100)}%`, true);
        if (playerDefuseTimer >= rounds.state.defuseSeconds) {
          rounds.defuseBomb();
          playerDefuseTimer = 0;
        }
      } else {
        playerDefuseTimer = 0;
      }
    }
    // Grenade.
    if (grenade.active && grenade.step(dt)) explodeGrenade();
  } else if (grenade.active) {
    // The player is dead: still step the grenade so smoke ages, flashes fade
    // and a frag in flight detonates.
    if (grenade.step(dt)) explodeGrenade();
  }

  // An attacking-team bot carrying the bomb plants it if it wanders onto the
  // attack site. (This proximity plant is the whole bot plant.)
  const attackers = rounds.state.attackingTeam === 'vanguard' ? friendlies : enemies;
  const carrier = attackers.find((b) => b.hasBomb && b.alive);
  if (carrier && !rounds.state.bombPlanted) {
    if (carrier.mover.state.position.distanceTo(attackSite) < 2.5) {
      botPlantTimer += dt;
      hudSetBomb(`Planting the bomb… ${Math.round((botPlantTimer / PLANT_SECONDS) * 100)}%`, false);
      if (botPlantTimer >= PLANT_SECONDS) {
        rounds.plantBomb(attackSite.clone());
        carrier.hasBomb = false;
        botPlantTimer = 0;
      }
    } else {
      botPlantTimer = 0;
    }
  }

  // Defuse: a defending-team bot standing at the planted bomb defuses it
  // over DEFUSE_SECONDS (bots never carry a kit; the kit only speeds up the
  // player's own defuse, above).
  if (rounds.state.bombPlanted) {
    const defenders = rounds.state.attackingTeam === 'vanguard' ? enemies : friendlies;
    const defuser = defenders.find(
      (b) => b.alive && b.mover.state.position.distanceTo(rounds.state.bombSite) < 2.5,
    );
    if (defuser) {
      botDefuseTimer += dt;
      hudSetBomb(`${defuser.name} is defusing the bomb… ${Math.round((botDefuseTimer / DEFUSE_SECONDS) * 100)}%`, true);
      if (botDefuseTimer >= DEFUSE_SECONDS) {
        rounds.defuseBomb();
        botDefuseTimer = 0;
      }
    } else {
      botDefuseTimer = 0;
    }
  }

  bots.update(dt, elapsed, botCtx);
  weaponRig.step(dt);
  // Bomb blink while planted; the ticker beeps every second. While a defuse
  // is in progress the defuse lines (player :907 / bot :952) own the status
  // line — the blink must not overwrite them every frame.
  if (rounds.state.bombPlanted) {
    bombBlink += dt;
    bombLight.material.color.set(bombBlink % 1 < 0.5 ? new THREE.Color(PALETTE.accent) : new THREE.Color('#7a1a1a'));
    if (playerDefuseTimer <= 0 && botDefuseTimer <= 0) {
      hudSetBomb(`BOMB PLANTED — ${Math.ceil(rounds.state.bombTimer)}s`, rounds.state.bombTimer <= 10);
    }
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
    else if (code === 'KeyG') throwGrenade('frag');
    else if (code === 'KeyB' && rounds.state.phase === 'buy') {
      buyOpen = !buyOpen;
      if (buyOpen) {
        hudShowBuy(rounds.state.money);
        if (document.pointerLockElement) document.exitPointerLock();
      } else {
        hudHideBuy();
        input.requestLock();
      }
    } else if (buyOpen && code.startsWith('Digit')) {
      // Buy phase: Digit1–6 buy the keyed core items (rifle/smg/sniper/
      // frag/armour/defuse kit); the extra items are click-only.
      const item = BUY_ITEMS.find((i) => i.key === code.slice(-1));
      if (item) buyItem(item.id);
    } else if (code === 'Digit1') throwGrenade('frag');
    else if (code === 'Digit2') throwGrenade('smoke');
    else if (code === 'Digit3') throwGrenade('flash');
    else if (code === 'Digit4') useHeal('bandage');
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
    if (started && !input.state.locked && !buyOpen && hud.isOverlayHidden() && !rounds.state.matchOver && !shot) {
      showOverlay(rounds.state.phase === 'over' ? 'roundEnd' : 'paused', rounds.state.phase === 'over' ? `Vanguard ${rounds.state.vanguardWins} — ${rounds.state.crimsonWins} Crimson. Click for the next round.` : undefined);
    }
    const def = weaponRig.def;
    if (input.state.firing && playerChar.alive && rounds.state.phase === 'live' && (def.auto || input.state.firing)) {
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
    hud.setAlive(aliveCount('vanguard') + aliveCount('crimson'), TOTAL_PLAYERS);
    hud.setCompass(player.state.yaw);
    hud.setCrosshairSpread(4 + weaponRig.spread(player.groundSpeed()) * 900);
    // Flash blindness (white overlay), location banner, circular minimap.
    camera.getWorldDirection(_tmp);
    if (typeof hud.setFlash === 'function') hud.setFlash(grenade.flashLevelAt(camera.position, _tmp));
    if (typeof hud.setLocationFrom === 'function') hud.setLocationFrom(player.state.position.x, player.state.position.z);
    if (typeof hud.drawMinimap === 'function') {
      hud.drawMinimap(
        player.state.position, player.state.yaw,
        {
          mode: 'rounds', sites: MAP.sites,
          bombSite: rounds.state.bombSite, bombPlanted: rounds.state.bombPlanted,
          combatants: minimapCombatants(),
        },
        { minX: MAP.minX, maxX: MAP.maxX, minZ: MAP.minZ, maxZ: MAP.maxZ },
      );
    }
    // Drain grenade detonations (smoke/flash) for HUD notes. Frags are
    // handled by grenade.step() -> explodeGrenade() in step().
    for (const ev of grenade.takeEvents()) {
      if (ev.type === 'smoke') hud.killfeed('Smoke deployed');
      else if (ev.type === 'flash') hud.killfeed('Flashbang detonated');
    }
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

// ?shot= captures never run frame(), so the live minimap draw never happens
// and every screenshot showed an empty minimap circle. Draw it once here,
// from the same state frame() uses, before the freeze.
function drawMinimapNow() {
  if (typeof hud.drawMinimap !== 'function') return;
  hud.drawMinimap(
    player.state.position, player.state.yaw,
    {
      mode: 'rounds', sites: MAP.sites,
      bombSite: rounds.state.bombSite, bombPlanted: rounds.state.bombPlanted,
      combatants: minimapCombatants(),
    },
    { minX: MAP.minX, maxX: MAP.maxX, minZ: MAP.minZ, maxZ: MAP.maxZ },
  );
}

function paintTwiceThenReady() {
  drawMinimapNow();
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
  hudHideBuy();
  if (name === 'start') {
    player.state.position.set(0.6, 0, 15);
    player.state.yaw = Math.PI;
    player.state.pitch = 0;
    settle(20);
    aimAt(new THREE.Vector3(-8, 1.4, -8));
    hudSetScore(0, 0, 1);
    hudSetMoney(800);
    hud.setHealth(MAX_HEALTH, MAX_HEALTH);
    hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, WEAPONS.pistol.name);
    hud.setAlive(TOTAL_PLAYERS, TOTAL_PLAYERS);
    hud.setCompass(player.state.yaw);
    showOverlay('start');
    paintTwiceThenReady();
    return;
  }
  if (name === 'buy') {
    player.state.position.set(0.6, 0, 15);
    player.state.yaw = Math.PI;
    settle(20);
    hudSetScore(0, 0, 1);
    hud.setHealth(MAX_HEALTH, MAX_HEALTH);
    hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, WEAPONS.pistol.name);
    hud.setAlive(TOTAL_PLAYERS, TOTAL_PLAYERS);
    hud.setCompass(player.state.yaw);
    hudShowBuy(4750);
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
      // No shot fired here: the muzzle flash washed out the weapon gradient
      // in 1-play.jpg. A clean aimed viewmodel shows the rifle best.
      hudSetScore(1, 0, 2);
      hudSetMoney(1100);
      hud.setHealth(100, MAX_HEALTH);
      hud.setTimer(62);
      hudSetBomb('Plant the bomb at A or B', false);
    } else {
      rounds.state.vanguardWins = 2;
      rounds.state.crimsonWins = 1;
      hudSetScore(2, 1, 3);
      hudSetMoney(4350);
      hud.setHealth(62, MAX_HEALTH);
      hud.setTimer(0);
      hud.showBanner('VANGUARD WINS THE ROUND', 'team eliminated  ·  Vanguard 2 — 1 Crimson', 60000);
    }
    hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, WEAPONS.rifle.name);
    hud.setAlive(aliveCount('vanguard') + aliveCount('crimson'), TOTAL_PLAYERS);
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
  rounds, bots, player, playerChar, world, matchState, matchEvents,
  get health() { return playerHealth; },
  get money() { return rounds.state.money; },
  get alive() { return aliveCount('vanguard') + aliveCount('crimson'); },
  get grenades() { return rounds.state.grenades; },
  botPositions() { return bots.bots.map((b) => ({ name: b.name, team: b.team, x: +b.mover.state.position.x.toFixed(2), z: +b.mover.state.position.z.toFixed(2), alive: b.alive, health: b.health })); },
};

// -- boot.
resetRound();
rounds.startRound();
hud.setHealth(MAX_HEALTH, MAX_HEALTH);
hud.setArmor(0);
hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, WEAPONS.pistol.name);
hudSetScore(0, 0, 1);
hudSetMoney(rounds.state.money);
hudSetGrenades(0);
hud.setTimer(rounds.state.timer);
hud.setAlive(TOTAL_PLAYERS, TOTAL_PLAYERS);
hud.setHeals(0, 0, 0);
hud.setBoost(0);
syncCamera();
if (shot) runShot(shot);
else {
  showOverlay('start');
  requestAnimationFrame(frame);
}
