// The DOM HUD: health, armour, ammo, timer, score, money, kill feed, bomb status, the
// buy menu and the one overlay panel. It never touches the simulation; main.js pushes
// numbers in and reads the play / buy callbacks out.
import { BUY_ITEMS } from './rounds.js';

const COPY = {
  start: { title: 'DUSTLINE', copy: 'A desert outpost at dusk. Plant the bomb at A or B, or eliminate the Crimson team. First to 5 rounds takes the match.', action: 'Click to play' },
  paused: { title: 'DUSTLINE', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  roundEnd: { title: 'Round over', copy: '', action: 'Next round' },
  matchEnd: { title: 'Match over', copy: '', action: 'Play again' },
};

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
  const scoreValue = $('score-value');
  const roundValue = $('round-value');
  const moneyValue = $('money-value');
  const grenadeValue = $('grenade-value');
  const bombStatus = $('bomb-status');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const killfeed = $('killfeed');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const damage = $('damage');
  const buyMenu = $('buy-menu');
  const buyItems = $('buy-items');
  const buyMoney = $('buy-money');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};
  let buyHandler = null;

  for (const item of BUY_ITEMS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'buy-item';
    button.dataset.item = item.id;
    button.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
    button.addEventListener('click', () => { if (buyHandler) buyHandler(item.id); });
    buyItems.appendChild(button);
  }

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
      setText(timerValue, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, 'timer');
      timerValue.classList.toggle('urgent', s <= 10);
    },
    setScore(vanguard, crimson, round) {
      setText(scoreValue, `${vanguard} — ${crimson}`, 'score');
      setText(roundValue, `ROUND ${round}`, 'round');
    },
    setMoney(money) {
      setText(moneyValue, `$${money}`, 'money');
      setText(buyMoney, `$${money}`, 'buymoney');
    },
    setGrenades(count) {
      setText(grenadeValue, count > 0 ? `◉ ${count}` : '', 'grenades');
    },
    setBomb(text, urgent) {
      setText(bombStatus, text, 'bomb');
      bombStatus.classList.toggle('urgent', !!urgent);
      bombStatus.style.display = text ? 'block' : 'none';
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
    showBuy(money) {
      this.setMoney(money);
      buyMenu.hidden = false;
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    buyResult(message) {
      $('buy-message').textContent = message || '';
    },
    onBuy(handler) { buyHandler = handler; },
    showOverlay(mode, extra) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = extra || text.copy;
      play.textContent = text.action;
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
