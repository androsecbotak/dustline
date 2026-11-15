// The DOM HUD for DUSTLINE v2 (battle royale): health, armour, ammo, zone timer,
// alive counter, zone status, healing items + boost, loot prompt, minimap, compass,
// kill feed, banner, crosshair, hitmarker, damage flash and the one overlay panel.
// It never touches the simulation; main.js pushes numbers in and reads the play
// callback out.
//
// Conventions the coordinator must match:
//  - yaw is the three.js rotation.y in radians; yaw 0 faces -Z, which is North.
//  - map coordinates are world x (east) / z (south); on the minimap -Z is up.
//  - setZone() also drives the zone timer display (the timer IS the zone timer).

const COPY = {
  start: { title: 'DUSTLINE', copy: 'DUSTLINE — Battle Royale. 12 drop in, 1 walks out. Loot, survive the blue zone, be the last one alive.', action: 'Click to play' },
  paused: { title: 'DUSTLINE', copy: 'Paused. Click to resume.', action: 'Click to resume' },
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

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
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
  const aliveValue = $('alive-value');
  const zoneStatus = $('zone-status');
  const healBandage = $('heal-bandage');
  const healMedkit = $('heal-medkit');
  const healDrink = $('heal-drink');
  const boostFill = $('boost-fill');
  const lootPrompt = $('loot-prompt');
  const minimap = $('minimap');
  const minimapCtx = minimap.getContext('2d');
  const compass = $('compass-canvas');
  const compassCtx = compass.getContext('2d');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const killfeed = $('killfeed');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const damage = $('damage');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};
  let totalPlayers = 12;

  function setText(el, value, key) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  return {
    setHealth(health, max) {
      const pct = Math.max(0, Math.round((health / max) * 100));
      healthFill.style.width = `${pct}%`;
      healthFill.classList.toggle('low', pct <= 30);
      setText(healthValue, String(health), 'health');
    },
    setArmor(armor) {
      armorRow.style.display = armor > 0 ? 'flex' : 'none';
      armorFill.style.width = `${Math.min(100, armor * 2)}%`;
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
      // The topbar timer IS the zone timer.
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
    drawMinimap(playerPos, yaw, zone, mapBounds) {
      const w = minimap.width;
      const h = minimap.height;
      const spanX = mapBounds.maxX - mapBounds.minX;
      const spanZ = mapBounds.maxZ - mapBounds.minZ;
      const toX = (x) => ((x - mapBounds.minX) / spanX) * w;
      const toZ = (z) => ((z - mapBounds.minZ) / spanZ) * h;
      const ctx = minimapCtx;

      // Sand map background.
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#b89b62';
      ctx.fillRect(0, 0, w, h);

      // Blue area: everything outside the current safe zone.
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(toX(zone.center.x), toZ(zone.center.z), (zone.radius / spanX) * w, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(46, 98, 178, 0.55)';
      ctx.fill('evenodd');

      // Next zone: smaller white circle.
      ctx.beginPath();
      ctx.arc(toX(zone.nextCenter.x), toZ(zone.nextCenter.z), (zone.nextRadius / spanX) * w, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Current safe zone: white circle.
      ctx.beginPath();
      ctx.arc(toX(zone.center.x), toZ(zone.center.z), (zone.radius / spanX) * w, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

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

      // Map border.
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    },
    setCompass(yaw) {
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

      // Degree ticks every 15 degrees.
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

      // Cardinal / intercardinal labels.
      for (const point of COMPASS_POINTS) {
        const off = wrapDeg(point.deg - heading);
        const x = w / 2 + off * pxPerDeg;
        if (x < 8 || x > w - 8) continue;
        const cardinal = point.label.length === 1;
        ctx.fillStyle = cardinal ? '#f0a830' : '#f2e8d8';
        ctx.font = `${cardinal ? '700' : '600'} ${cardinal ? 13 : 11}px ui-monospace, Menlo, monospace`;
        ctx.fillText(point.label, x, 10);
      }

      // Centre marker.
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
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => { if (line.parentNode) line.remove(); }, 6000);
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
    showOverlay(mode, extra) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = extra || text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    showMatchEnd(placement, winnerName, isPlayerWinner) {
      const text = isPlayerWinner
        ? `#${placement} of ${totalPlayers} — WINNER WINNER!`
        : `#${placement} of ${totalPlayers} — eliminated by ${winnerName}`;
      this.showOverlay('matchEnd', text);
      if (isPlayerWinner) title.textContent = 'WINNER WINNER!';
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
