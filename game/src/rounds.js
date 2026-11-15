// Rounds: the match state machine. Buy time, live round, round end, match end.
// Money is earned per kill and per round and spent in the buy menu; the bomb is the
// objective beyond killing — plant it at A or B, or stop the other team planting it.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';

export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const BOMB_FUSE_SECONDS = 35;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const WIN_ROUNDS = 5;
const WIN_BONUS = 3250;
const LOSS_BONUS = 1900;
const KILL_BONUS = 300;
const PLANT_BONUS = 300;
const DEFUSE_BONUS = 300;

export const BUY_ITEMS = [
  { id: 'rifle', name: 'VK-47 Rifle', desc: 'Accurate automatic rifle', price: WEAPONS.rifle.price, key: '1' },
  { id: 'smg', name: 'Raptor-9 SMG', desc: 'Fast close-range spray', price: WEAPONS.smg.price, key: '2' },
  { id: 'sniper', name: 'Longshot Sniper', desc: 'One shot, long range', price: WEAPONS.sniper.price, key: '3' },
  { id: 'grenade', name: 'Frag Grenade', desc: 'Throwable, big blast', price: GRENADE_PRICE, key: '4' },
  { id: 'armor', name: 'Kevlar Vest', desc: '+50 armour', price: ARMOR_PRICE, key: '5' },
];

export function createRounds(events) {
  const state = {
    phase: 'buy',
    round: 1,
    timer: BUY_SECONDS,
    vanguardWins: 0,
    crimsonWins: 0,
    money: 800,
    armor: 0,
    grenades: 0,
    bombPlanted: false,
    bombSite: null,
    bombTimer: 0,
    bombCarrier: 'player',
    bombDroppedAt: null,
    matchOver: false,
    matchWinner: null,
    lastResult: null,
  };

  function startRound() {
    state.phase = 'buy';
    state.timer = BUY_SECONDS;
    state.bombPlanted = false;
    state.bombSite = null;
    state.bombTimer = 0;
    state.bombCarrier = 'player';
    state.bombDroppedAt = null;
    events.onRoundStart(state.round);
  }

  function startLive() {
    state.phase = 'live';
    state.timer = ROUND_SECONDS;
    events.onLive();
  }

  function endRound(winner, reason) {
    if (state.phase === 'over') return;
    state.phase = 'over';
    state.timer = 5;
    state.lastResult = { winner, reason, round: state.round };
    if (winner === 'vanguard') {
      state.vanguardWins += 1;
      state.money += WIN_BONUS;
    } else {
      state.crimsonWins += 1;
      state.money += LOSS_BONUS;
    }
    events.onRoundEnd(winner, reason, state);
    if (state.vanguardWins >= WIN_ROUNDS || state.crimsonWins >= WIN_ROUNDS) {
      state.matchOver = true;
      state.matchWinner = state.vanguardWins >= WIN_ROUNDS ? 'vanguard' : 'crimson';
      events.onMatchEnd(state.matchWinner, state);
    }
  }

  function nextRound() {
    if (state.matchOver) return;
    state.round += 1;
    startRound();
    events.onResetRound();
  }

  return {
    state,
    startRound,
    startLive,
    endRound,
    nextRound,
    update(dt) {
      if (state.phase === 'over') {
        state.timer -= dt;
        if (state.timer <= 0) nextRound();
        return;
      }
      state.timer -= dt;
      if (state.phase === 'buy' && state.timer <= 0) startLive();
      if (state.phase === 'live') {
        if (state.bombPlanted) {
          state.bombTimer -= dt;
          if (state.bombTimer <= 0) endRound('vanguard', 'bomb');
        } else if (state.timer <= 0) {
          endRound('crimson', 'time');
        }
      }
    },
    onKill() {
      state.money += KILL_BONUS;
    },
    plantBomb(site) {
      if (state.phase !== 'live' || state.bombPlanted) return false;
      state.bombPlanted = true;
      state.bombSite = site;
      state.bombTimer = BOMB_FUSE_SECONDS;
      state.money += PLANT_BONUS;
      events.onBombPlanted(site);
      return true;
    },
    defuseBomb() {
      if (!state.bombPlanted) return false;
      state.bombPlanted = false;
      state.bombSite = null;
      state.money += DEFUSE_BONUS;
      events.onBombDefused();
      endRound('crimson', 'defuse');
      return true;
    },
    buy(itemId) {
      if (state.phase !== 'buy') return { ok: false, reason: 'buy time is over' };
      const item = BUY_ITEMS.find((i) => i.id === itemId);
      if (!item) return { ok: false, reason: 'no such item' };
      if (state.money < item.price) return { ok: false, reason: 'not enough money' };
      if (itemId === 'grenade' && state.grenades >= 2) return { ok: false, reason: 'carrying 2 grenades already' };
      if (itemId === 'armor' && state.armor >= 50) return { ok: false, reason: 'armour already full' };
      state.money -= item.price;
      if (itemId === 'grenade') state.grenades += 1;
      else if (itemId === 'armor') state.armor = 50;
      else events.onBuyWeapon(itemId);
      events.onBuy(item, state.money);
      return { ok: true };
    },
    dropBomb(at) {
      if (state.bombCarrier !== 'player') return;
      state.bombCarrier = 'dropped';
      state.bombDroppedAt = at.clone();
    },
    pickupBomb(who) {
      if (state.bombCarrier !== 'dropped' || state.bombPlanted) return false;
      state.bombCarrier = who;
      state.bombDroppedAt = null;
      return true;
    },
  };
}
