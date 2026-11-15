// The DOM HUD for DUSTLINE v3 (rounds): health, armour, ammo, round timer,
// team score, money, grenade + heal counts, kill feed, radio lines, bomb
// status, the buy menu (with weapon stats and owned/affordability states),
// a circular minimap with site labels, the compass strip, location banner,
// flash overlay, and the end-of-match scoreboard. It never touches the
// simulation; main.js pushes numbers in and reads the play / buy callbacks
// out. v1 rounds methods (showBuy, hideBuy, setScore, setMoney, setBomb,
// setGrenades, buyResult, onBuy) are restored, and the v2 BR methods
// (setAlive, setZone, setHeals, setBoost, setLootPrompt, drawMinimap,
// showMatchEnd) are kept so nothing that calls them breaks.
//
// Conventions:
//  - yaw is the three.js rotation.y in radians; yaw 0 faces -Z, which is North.
//  - map coordinates are world x (east) / z (south); on the minimap -Z is up.
//  - the buy menu is only open during the buy phase; main.js enforces that.
//  - index.html hides #minimap and #zone-status for rounds mode; this module
//    re-shows the minimap with inline styles (no index.html edit needed).
import { BUY_ITEMS } from './rounds.js';
import { WEAPONS } from './weapons.js';
import { locationAt, SITES } from './world.js';

const COPY = {
  start: { title: 'DUSTLINE', copy: 'A desert outpost at dusk. Plant the bomb at A or B, or eliminate the Crimson team. First to 5 rounds takes the match.', action: 'Click to play' },
  paused: { title: 'DUSTLINE', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  roundEnd: { title: 'Round over', copy: '', action: 'Next round' },
  matchEnd: { title: 'Match over', copy: '', action: 'Play again' },
};

const COMPASS_POINTS = [
  { deg: 0, label: 'N' },
  { deg: 45, label: 'NE' },
  { deg: 90, label: 'E' },
  { deg: 135, label: 'SE' },
  { deg: 180, label: 'S' },
  { deg: 225, label: 'SW' },
  { deg: 270, label: 'W' },
  { deg: 315, label: 'NW' },
];


function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Heading in degrees, 0 = North (-Z), 90 = East (+X), clockwise.
function yawToHeadingDeg(yaw) {
  return (((-yaw * 180) / Math.PI) % 360 + 360) % 360;
}

function wrapDeg(deg) {
  return ((deg + 180) % 360 + 360) % 360 - 180;
}

function rpmOf(def) {
  if (!def || !def.fireGap) return 0;
  return Math.round(60 / def.fireGap);
}

function weaponStatLine(def) {
  if (!def) return '';
  const pellets = def.pellets && def.pellets > 1 ? `×${def.pellets}` : '';
  return `DMG ${def.damage}${pellets} · ${rpmOf(def)} RPM · ${def.mag} MAG`;
}

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const panel = overlay ? overlay.querySelector('.panel') : null;
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const armorFill = $('armor-fill');
  const armorRow = $('armor-row');
  const timerValue = $('timer-value');
  const scoreValue = $('score-value');
  const roundValue = $('round-value');
  const moneyValue = $('money-value');
  const grenadeValue = $('grenade-value');
  const bombStatus = $('bomb-status');
  const aliveValue = $('alive-value');
  const zoneStatus = $('zone-status');
  const healBandage = $('heal-bandage');
  const healMedkit = $('heal-medkit');
  const healDrink = $('heal-drink');
  const boostFill = $('boost-fill');
  const lootPrompt = $('loot-prompt');
  const minimap = $('minimap');
  const minimapCtx = minimap ? minimap.getContext('2d') : null;
  const compass = $('compass-canvas');
  const compassCtx = compass ? compass.getContext('2d') : null;
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const killfeed = $('killfeed');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const damage = $('damage');
  const buyMenu = $('buy-menu');
  const buyItems = $('buy-items');
  const buyTabs = $('buy-tabs');
  const buyDetail = $('buy-detail');
  const buyMoney = $('buy-money');
  const buyMessage = $('buy-message');

  // Flash overlay: a full-screen white wash whose opacity is the player's
  // blindness (0–1). Created here because index.html has no such element.
  const flash = document.createElement('div');
  flash.id = 'flash-overlay';
  flash.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;';
  $('hud').appendChild(flash);

  // Location label: a small readout under the top bar, updated when the
  // player enters a new named zone (world.js locationAt).
  const locationLabel = document.createElement('div');
  locationLabel.id = 'location-label';
  locationLabel.style.cssText = 'position:fixed;top:124px;left:50%;transform:translateX(-50%);font-family:ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:.14em;color:#a8a29a;background:rgba(35,42,51,.8);padding:4px 10px;border:1px solid #4a3a28;border-radius:4px;pointer-events:none;';
  $('hud').appendChild(locationLabel);
  let lastLocation = null;
  let locationTimer = 0;

  // End-of-match scoreboard, built once and reused, appended to the overlay
  // panel (hidden until a match ends).
  const scoreboard = document.createElement('div');
  scoreboard.id = 'scoreboard';
  scoreboard.style.cssText = 'display:none;margin-top:18px;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#f2e8d8;';
  if (panel) panel.appendChild(scoreboard);

  // The minimap canvas exists in index.html but is display:none in rounds
  // mode: re-show it as a circular map, top-left, clear of the compass.
  if (minimap) {
    minimap.style.cssText = 'display:block;position:fixed;top:48px;left:28px;width:150px;height:150px;border-radius:50%;border:2px solid rgba(240,168,48,.85);box-shadow:0 0 0 1px rgba(0,0,0,.5);pointer-events:none;';
  }

  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};
  let totalPlayers = 10;
  let buyHandler = null;
  let money = 800;
  let armor = 0;
  let defending = false;
  // Owned buyables. The pistol is owned from the start; weapons, the defuse
  // kit and armour join via noteBought() / setArmor().
  const owned = new Set(['pistol']);

  function setText(el, value, key) {
    if (!el) return;
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  function feedLine(text, style) {
    if (!killfeed) return;
    const line = document.createElement('div');
    line.className = 'feed-line';
    line.textContent = text;
    if (style) line.style.cssText = style;
    killfeed.prepend(line);
    while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
    return line;
  }

  // -- buy menu (Point Blank style) -----------------------------------------
  // Tabs across the top, weapon list on the left, selected weapon's stat
  // bars + price + BUY on the right. Click a row to select, click BUY (or
  // keys 1-6) to buy. Rows show name, price and a silhouette; states are
  // Owned / Too expensive / buyable. The defuse kit is highlighted while
  // the player's team defends (halftime side swap). Buy logic is rounds.js.
  const BUY_TABS = [
    { id: 'rifle', label: 'ASSAULT RIFLE' },
    { id: 'smg', label: 'SMG' },
    { id: 'sniper', label: 'SNIPER' },
    { id: 'shotgun', label: 'SHOTGUN' },
    { id: 'pistol', label: 'PISTOL' },
    { id: 'gear', label: 'GEAR' },
    { id: 'grenade', label: 'GRENADE' },
    { id: 'medical', label: 'MEDICAL' },
  ];
  // PB tab for an item: weapons by kind (the DMR is a marksman rifle, so it
  // sits on the Sniper tab), the rest by their rounds.js category.
  function tabOf(item) {
    const def = WEAPONS[item.id];
    if (def) return def.kind === 'dmr' ? 'sniper' : def.kind;
    if (item.cat === 'grenades') return 'grenade';
    return item.cat || 'gear';
  }
  // Tiny weapon silhouettes (fill = currentColor), one per kind.
  const ICONS = {
    pistol: '<path d="M4 5h26v4H14l-2 6H8l2-6H4z"/>',
    rifle: '<path d="M2 6h34v3H26l-2 5h-5l2-5H12l-1 4H7l1-4H2zM36 5h10v5H36z"/>',
    smg: '<path d="M2 6h26v3H20l-2 6h-4l2-6H2zM28 5h12v5H28z"/>',
    sniper: '<path d="M2 7h40v2H24l-1 4h-4l1-4H2zM16 4h8v3h-8zM42 6h6v4h-6z"/>',
    shotgun: '<path d="M2 5h36v4H20l-2 5h-5l2-5H2zM38 4h8v6h-8z"/>',
    dmr: '<path d="M2 6h38v3H26l-2 5h-5l2-5H12l-1 4H7l1-4H2zM18 3h8v3h-8z"/>',
    gear: '<path d="M24 2l14 5v12l-14 7-14-7V7z"/>',
    grenade: '<circle cx="20" cy="14" r="10"/><path d="M20 4V2h8v2z"/>',
    medical: '<path d="M18 4h12v10H40v12H30v10H18V26H8V14h10z"/>',
  };
  function iconOf(item) {
    const def = WEAPONS[item.id];
    const kind = def ? def.kind : (item.cat === 'grenades' ? 'grenade' : item.cat === 'medical' ? 'medical' : 'gear');
    return `<svg viewBox="0 0 48 28" fill="currentColor" aria-hidden="true">${ICONS[kind] || ICONS.gear}</svg>`;
  }
  // Accuracy 5-99, derived from still spread: tighter spread = more accurate.
  function accuracyOf(def) {
    return Math.max(5, Math.min(99, Math.round(100 - def.spreadStill * 1000)));
  }
  function statRows(def) {
    const pellets = def.pellets > 1 ? `×${def.pellets}` : '';
    const stats = [
      ['DAMAGE', Math.min(100, Math.round(((def.damage * (def.pellets || 1)) / 120) * 100)), `${def.damage}${pellets}`],
      ['FIRE RATE', Math.min(100, Math.round((rpmOf(def) / 900) * 100)), `${rpmOf(def)} RPM`],
      ['ACCURACY', accuracyOf(def), String(accuracyOf(def))],
      ['RANGE', Math.min(100, Math.round((def.range / 100) * 100)), `${def.range}m`],
      ['MAGAZINE', Math.min(100, Math.round((def.mag / 32) * 100)), String(def.mag)],
    ];
    return stats.map(([label, pct, value]) => `<div class="stat-row"><label>${label}</label><span class="stat-bar"><i style="width:${pct}%"></i></span><b>${value}</b></div>`).join('');
  }
  let activeTab = 'rifle';
  let selectedId = 'rifle';
  function buyRowState(item) {
    if (item.id === 'pistol' || owned.has(item.id)) return 'owned';
    if (item.id === 'armor' && armor >= 50) return 'owned';
    if (item.price > money) return 'expensive';
    return 'buyable';
  }

  function renderBuy() {
    if (!buyItems) return;
    // The pistol is owned, never bought: it lives on the Pistol tab.
    const items = [
      { id: 'pistol', name: WEAPONS.pistol.name, desc: 'Your starting sidearm', price: 0, key: '', cat: 'sidearms' },
      ...BUY_ITEMS,
    ];
    if (buyTabs) {
      buyTabs.innerHTML = '';
      for (const tab of BUY_TABS) {
        if (!items.some((i) => tabOf(i) === tab.id)) continue;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `buy-tab${tab.id === activeTab ? ' active' : ''}`;
        b.textContent = tab.label;
        b.setAttribute('role', 'tab');
        b.addEventListener('click', () => {
          activeTab = tab.id;
          const first = items.find((i) => tabOf(i) === tab.id);
          if (first) selectedId = first.id;
          renderBuy();
        });
        buyTabs.appendChild(b);
      }
    }
    buyItems.innerHTML = '';
    for (const item of items.filter((i) => tabOf(i) === activeTab)) {
      const def = WEAPONS[item.id];
      const state = buyRowState(item);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `buy-item${item.id === selectedId ? ' sel' : ''}`;
      button.dataset.item = item.id;
      const price = state === 'owned'
        ? '<span class="buy-price own">OWNED</span>'
        : state === 'expensive'
          ? `<span class="buy-price exp">$${item.price}</span>`
          : `<span class="buy-price">$${item.price}</span>`;
      const keyTag = item.key ? ` <span style="color:var(--accent)">[${item.key}]</span>` : '';
      const sub = def ? weaponStatLine(def) : item.desc;
      button.innerHTML = `<span class="buy-icon">${iconOf(item)}</span>`
        + `<span><span class="buy-name">${item.name}${keyTag}</span><span class="buy-sub2">${sub}</span></span>`
        + price;
      if (state === 'expensive') button.style.opacity = '0.5';
      if (item.id === 'defusekit' && defending && state !== 'owned') button.style.borderColor = '#f0a830';
      button.addEventListener('click', () => { selectedId = item.id; renderBuy(); });
      buyItems.appendChild(button);
    }
    renderDetail(items.find((i) => i.id === selectedId) || items[0]);
  }

  function renderDetail(item) {
    if (!buyDetail || !item) return;
    const def = WEAPONS[item.id];
    const state = buyRowState(item);
    const kind = def ? def.kind.toUpperCase() : (item.cat || 'gear').toUpperCase();
    const defendingTag = item.id === 'defusekit' && defending && state !== 'owned'
      ? '<p class="buy-desc">★ DEFENDING — halves your defuse time</p>'
      : '';
    const stats = def ? statRows(def) : `<p class="buy-desc">${item.desc}</p>`;
    const btnLabel = state === 'owned' ? 'OWNED' : state === 'expensive' ? 'TOO EXPENSIVE' : `BUY — $${item.price}`;
    buyDetail.innerHTML = `<h3>${item.name}</h3><div class="buy-kind">${kind}</div>${defendingTag}${stats}`
      + `<div class="buy-detail-price"><span>PRICE</span><b>$${item.price}</b></div>`
      + `<button type="button" id="buy-now"${state !== 'buyable' ? ' disabled' : ''}>${btnLabel}</button>`;
    const now = buyDetail.querySelector('#buy-now');
    if (now && state === 'buyable') now.addEventListener('click', () => { if (buyHandler) buyHandler(item.id); });
  }

  function renderScoreboard(winner, st, stats) {
    const isWin = winner === 'vanguard';
    const rows = Object.values(stats || {});
    const teamRows = (team) => rows
      .filter((r) => r.team === team)
      .sort((a, b) => b.kills - a.kills || b.damage - a.damage);
    const hsPct = (r) => (r.shots > 0 ? Math.round((r.headshots / r.shots) * 100) : 0);
    const teamTable = (team, label) => {
      const list = teamRows(team);
      if (list.length === 0) return '';
      const body = list.map((r) => {
        const you = r.name === 'You' ? ' style="color:#f0a830;"' : '';
        return `<tr${you}><td>${r.name}</td><td>${r.kills}</td><td>${r.deaths}</td>`
          + `<td>${r.assists}</td><td>${hsPct(r)}%</td><td>${r.damage}</td><td>$${r.cash || 0}</td></tr>`;
      }).join('');
      return `<div style="margin-top:10px;color:#a8a29a;">${label}</div>`
        + `<table style="width:100%;border-collapse:collapse;text-align:right;">`
        + `<thead><tr style="color:#a8a29a;"><th style="text-align:left;">PLAYER</th><th>K</th><th>D</th><th>A</th><th>HS%</th><th>DMG</th><th>$</th></tr></thead>`
        + `<tbody>${body}</tbody></table>`;
    };
    const score = st ? `${st.vanguardWins} — ${st.crimsonWins}` : '';
    scoreboard.innerHTML = `<div style="font-size:15px;font-weight:700;color:${isWin ? '#7fb069' : '#d53a3a'};">`
      + `${isWin ? 'VICTORY' : 'DEFEAT'}${score ? ` · ${score}` : ''}</div>`
      + teamTable('vanguard', 'VANGUARD')
      + teamTable('crimson', 'CRIMSON');
    scoreboard.style.display = 'block';
  }

  return {
    setHealth(health, max) {
      const pct = Math.max(0, Math.round((health / max) * 100));
      healthFill.style.width = `${pct}%`;
      healthFill.classList.toggle('low', pct <= 30);
      setText(healthValue, String(health), 'health');
    },
    setArmor(value) {
      armor = value;
      armorRow.style.display = armor > 0 ? 'flex' : 'none';
      armorFill.style.width = `${Math.min(100, armor * 2)}%`;
      if (buyMenu && !buyMenu.hidden) renderBuy();
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, String(mag), 'mag');
      setText(ammoReserve, `/ ${reserve}`, 'reserve');
      setText(weaponName, name, 'weapon');
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setTimer(seconds) {
      const s = Math.max(0, Math.ceil(seconds));
      setText(timerValue, formatClock(s), 'timer');
      timerValue.classList.toggle('urgent', s <= 10);
    },
    setScore(vanguard, crimson, round) {
      setText(scoreValue, `${vanguard} — ${crimson}`, 'score');
      setText(roundValue, `ROUND ${round}`, 'round');
    },
    setMoney(value) {
      money = value;
      setText(moneyValue, `$${money}`, 'money');
      // Buy panel cash gets a thousands separator (PB-style "$4,750"); the
      // top-bar readout keeps the plain "$4750" format.
      setText(buyMoney, `$${money.toLocaleString('en-US')}`, 'buymoney');
      if (buyMenu && !buyMenu.hidden) renderBuy();
    },
    // count: a frag count (v1) or { frag, smoke, flash } (v3 grenade wiring).
    setGrenades(count) {
      let text = '';
      if (count && typeof count === 'object') {
        text = `◉ ${count.frag || 0} · ☁ ${count.smoke || 0} · ✦ ${count.flash || 0}`;
      } else if (count > 0) {
        text = `◉ ${count}`;
      }
      setText(grenadeValue, text, 'grenades');
    },
    setGrenadeCounts(frag, smoke, flash) {
      this.setGrenades({ frag, smoke, flash });
    },
    setBomb(text, urgent) {
      setText(bombStatus, text, 'bomb');
      bombStatus.classList.toggle('urgent', !!urgent);
      bombStatus.style.display = text ? 'block' : 'none';
    },
    setAlive(alive, total) {
      if (total > 0) totalPlayers = total;
      setText(aliveValue, `ALIVE ${alive}`, 'alive');
    },
    setZone(phase, timerSeconds, phaseState) {
      const clock = formatClock(timerSeconds);
      const shrinking = phaseState === 'shrink';
      const text = shrinking
        ? `ZONE ${phase} — SHRINKING ${clock}`
        : `ZONE ${phase} — shrinks in ${clock}`;
      setText(zoneStatus, text, 'zone');
      zoneStatus.classList.toggle('shrinking', shrinking);
      this.setTimer(timerSeconds);
    },
    setZoneOutside(isOutside) {
      zoneStatus.classList.toggle('outside', !!isOutside);
    },
    setHeals(bandage, medkit, drink) {
      const slots = [
        [healBandage, bandage, 'heal-bandage'],
        [healMedkit, medkit, 'heal-medkit'],
        [healDrink, drink, 'heal-drink'],
      ];
      for (const [el, count, key] of slots) {
        const label = el.dataset.label;
        setText(el, `${label} x${count}`, key);
        el.classList.toggle('empty', count <= 0);
      }
    },
    setBoost(pct) {
      const clamped = Math.max(0, Math.min(100, pct));
      boostFill.style.width = `${clamped}%`;
    },
    setLootPrompt(text) {
      if (!text) {
        lootPrompt.hidden = true;
        return;
      }
      const label = /^press e\b/i.test(text) ? text : `Press E — ${text}`;
      setText(lootPrompt, label, 'loot');
      lootPrompt.hidden = false;
    },
    setFlash(level) {
      flash.style.opacity = String(Math.max(0, Math.min(1, level || 0)));
    },
    // Location banner: updates the readout; the first call sets it silently,
    // later zone changes flash the label briefly.
    setLocationFrom(x, z) {
      const zone = locationAt(x, z);
      const name = zone.name;
      if (lastLocation === name) return;
      const first = lastLocation === null;
      lastLocation = name;
      locationLabel.textContent = name;
      if (first) return;
      locationLabel.style.color = '#f0a830';
      clearTimeout(locationTimer);
      locationTimer = setTimeout(() => { locationLabel.style.color = '#a8a29a'; }, 1600);
    },
    drawMinimap(playerPos, yaw, info, mapBounds) {
      if (!minimapCtx) return;
      const w = minimap.width;
      const h = minimap.height;
      const spanX = mapBounds.maxX - mapBounds.minX;
      const spanZ = mapBounds.maxZ - mapBounds.minZ;
      const toX = (x) => ((x - mapBounds.minX) / spanX) * w;
      const toZ = (z) => ((z - mapBounds.minZ) / spanZ) * h;
      const ctx = minimapCtx;
      const cx = w / 2;
      const cy = h / 2;
      const r = w / 2;

      // Legacy BR call (info is a zone with a centre): keep the v2 rendering.
      if (info && info.center && !info.mode) {
        const zone = info;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#b89b62';
        ctx.fillRect(0, 0, w, h);
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.arc(toX(zone.center.x), toZ(zone.center.z), (zone.radius / spanX) * w, 0, Math.PI * 2, true);
        ctx.fillStyle = 'rgba(46, 98, 178, 0.55)';
        ctx.fill('evenodd');
        ctx.beginPath();
        ctx.arc(toX(zone.nextCenter.x), toZ(zone.nextCenter.z), (zone.nextRadius / spanX) * w, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(toX(zone.center.x), toZ(zone.center.z), (zone.radius / spanX) * w, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        const px = toX(playerPos.x);
        const py = toZ(playerPos.z);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(-yaw);
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(5, 6);
        ctx.lineTo(0, 3);
        ctx.lineTo(-5, 6);
        ctx.closePath();
        ctx.fillStyle = '#f0a830';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
        return;
      }

      // Rounds mode: circular map, sites A/B, player arrow, teammate dots,
      // and the planted bomb. Enemies are never shown.
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#b89b62';
      ctx.fillRect(0, 0, w, h);
      // Yard tint: darker border band inside the map edge.
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = 8;
      ctx.strokeRect(0, 0, w, h);
      // Site markers with labels.
      const sites = (info && info.sites) || {
        A: { x: SITES.A.pos.x, z: SITES.A.pos.z },
        B: { x: SITES.B.pos.x, z: SITES.B.pos.z },
      };
      ctx.font = '700 11px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const letter of ['A', 'B']) {
        const site = sites[letter];
        if (!site) continue;
        const sx = toX(site.x);
        const sy = toZ(site.z);
        ctx.fillStyle = '#f0a830';
        ctx.fillRect(sx - 5, sy - 5, 10, 10);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - 5, sy - 5, 10, 10);
        ctx.fillStyle = '#f2e8d8';
        ctx.fillText(letter, sx, sy - 12);
      }
      // Planted bomb: red pulsing ring on its site.
      if (info && info.bombPlanted && info.bombSite) {
        const bx = toX(info.bombSite.x);
        const by = toZ(info.bombSite.z);
        ctx.beginPath();
        ctx.arc(bx, by, 9, 0, Math.PI * 2);
        ctx.strokeStyle = '#d53a3a';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#d53a3a';
        ctx.fill();
      }
      // Teammate dots (Vanguard, alive, not the player).
      if (info && Array.isArray(info.combatants)) {
        for (const c of info.combatants) {
          if (c.isPlayer || !c.alive || c.team !== 'vanguard') continue;
          ctx.beginPath();
          ctx.arc(toX(c.x), toZ(c.z), 3, 0, Math.PI * 2);
          ctx.fillStyle = '#7fb069';
          ctx.fill();
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      // Player arrow, rotated by yaw (yaw 0 = North = up).
      const px = toX(playerPos.x);
      const py = toZ(playerPos.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-yaw);
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-5, 6);
      ctx.closePath();
      ctx.fillStyle = '#f0a830';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      ctx.restore();
      // Circular rim.
      ctx.beginPath();
      ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(240, 168, 48, 0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    },
    setCompass(yaw) {
      if (!compassCtx) return;
      const w = compass.width;
      const h = compass.height;
      const heading = yawToHeadingDeg(yaw);
      const pxPerDeg = 3; // 360px strip shows a ~120-degree window.
      const ctx = compassCtx;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(35, 42, 51, 0.72)';
      ctx.fillRect(0, 0, w, h);
      ctx.font = '600 11px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(242, 232, 216, 0.35)';
      ctx.fillStyle = 'rgba(242, 232, 216, 0.55)';
      ctx.lineWidth = 1;
      for (let deg = 0; deg < 360; deg += 15) {
        const off = wrapDeg(deg - heading);
        const x = w / 2 + off * pxPerDeg;
        if (x < -10 || x > w + 10) continue;
        const major = deg % 45 === 0;
        ctx.beginPath();
        ctx.moveTo(x, h - (major ? 9 : 6));
        ctx.lineTo(x, h);
        ctx.stroke();
        if (!major) ctx.fillText(String(deg), x, 8);
      }
      for (const point of COMPASS_POINTS) {
        const off = wrapDeg(point.deg - heading);
        const x = w / 2 + off * pxPerDeg;
        if (x < 8 || x > w - 8) continue;
        const cardinal = point.label.length === 1;
        ctx.fillStyle = cardinal ? '#f0a830' : '#f2e8d8';
        ctx.font = `${cardinal ? '700' : '600'} ${cardinal ? 13 : 11}px ui-monospace, Menlo, monospace`;
        ctx.fillText(point.label, x, 10);
      }
      ctx.fillStyle = '#f0a830';
      ctx.beginPath();
      ctx.moveTo(w / 2 - 5, 0);
      ctx.lineTo(w / 2 + 5, 0);
      ctx.lineTo(w / 2, 6);
      ctx.closePath();
      ctx.fill();
    },
    setCrosshairSpread(spreadPx) {
      crosshair.style.setProperty('--gap', `${Math.round(spreadPx)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', !!killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damage.classList.remove('on');
      void damage.offsetWidth;
      damage.classList.add('on');
    },
    killfeed(text) {
      const line = feedLine(text);
      if (line) setTimeout(() => { if (line.parentNode) line.remove(); }, 6000);
    },
    // Kill feed entry from matchEvents.onKill(killer, victim, weapon).
    feedKill(killerName, victimName, weaponName, isHead) {
      const line = feedLine(
        `${killerName} ▸ ${victimName} · ${weaponName || ''}${isHead ? ' (headshot)' : ''}`,
      );
      if (line) setTimeout(() => { if (line.parentNode) line.remove(); }, 6000);
    },
    // Radio callout from matchEvents.onRadio(text): same feed, amber, longer.
    radio(text) {
      const line = feedLine(`RADIO: ${text}`, 'color:#f0a830;border-color:#f0a830;');
      if (line) setTimeout(() => { if (line.parentNode) line.remove(); }, 8000);
    },
    showBanner(titleText, subText, ms = 2600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText || '';
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), ms);
    },
    hideBanner() {
      banner.classList.remove('on');
      clearTimeout(bannerTimer);
    },
    showBuy(moneyValue, isDefending) {
      this.setMoney(moneyValue);
      defending = !!isDefending;
      renderBuy();
      buyMessage.textContent = '';
      buyMenu.hidden = false;
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    buyResult(message) {
      buyMessage.textContent = message || '';
      if (buyMenu && !buyMenu.hidden) renderBuy();
    },
    // Called by main.js after a successful purchase so the row flips to Owned.
    noteBought(itemId) {
      owned.add(itemId);
      if (buyMenu && !buyMenu.hidden) renderBuy();
    },
    onBuy(handler) { buyHandler = handler; },
    showOverlay(mode, extra) {
      const text = COPY[mode] || COPY.paused;
      title.textContent = text.title;
      copy.textContent = extra || text.copy;
      play.textContent = text.action;
      scoreboard.style.display = 'none';
      overlay.hidden = false;
      play.focus();
    },
    showMatchEnd(placement, winnerName, isPlayerWinner, stats) {
      if (stats) {
        renderScoreboard(isPlayerWinner ? 'vanguard' : 'crimson', null, stats);
        title.textContent = isPlayerWinner ? 'VICTORY' : 'DEFEAT';
        copy.textContent = isPlayerWinner
          ? `#${placement} of ${totalPlayers} — you take the match.`
          : `#${placement} of ${totalPlayers} — eliminated by ${winnerName}`;
        play.textContent = 'Play again';
        overlay.hidden = false;
        play.focus();
        return;
      }
      const text = isPlayerWinner
        ? `#${placement} of ${totalPlayers} — WINNER WINNER!`
        : `#${placement} of ${totalPlayers} — eliminated by ${winnerName}`;
      this.showOverlay('matchEnd', text);
      if (isPlayerWinner) title.textContent = 'WINNER WINNER!';
    },
    // End-of-match scoreboard: VICTORY/DEFEAT + a per-team K/D/A, HS%, damage
    // and cash table from window.__dustline.matchState.stats (passed in by
    // main.js). Keeps the v2 match-end overlay structure.
    showMatchScoreboard(winner, st, stats) {
      const isWin = winner === 'vanguard';
      renderScoreboard(winner, st, stats);
      title.textContent = isWin ? 'VICTORY' : 'DEFEAT';
      copy.textContent = st
        ? (isWin
          ? `Vanguard takes the match ${st.vanguardWins} — ${st.crimsonWins}.`
          : `Crimson takes the match ${st.crimsonWins} — ${st.vanguardWins}.`)
        : '';
      play.textContent = 'Play again';
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    isOverlayHidden() {
      return overlay.hidden;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
