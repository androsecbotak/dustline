// Rounds: the match state machine. Buy time, live round, round end, match end.
// Money is earned per kill and per round and spent in the buy menu; the bomb is the
// objective beyond killing — plant it at A or B, or stop the other team planting it.
// 5v5: rounds 1–6 Vanguard attacks and Crimson defends; at halftime (round 7)
// the sides swap, so rounds 7–12 Crimson attacks and Vanguard defends —
// that is when the player can defuse, and a defuse kit halves their defuse
// time. First to 5 round wins takes the match (max 12 rounds; a tie on
// rounds goes to Crimson, the defending side in the first half).
import { WEAPONS, GRENADE_PRICE, SMOKE_PRICE, FLASH_PRICE, ARMOR_PRICE, DEFUSEKIT_PRICE } from './weapons.js';

export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const BOMB_FUSE_SECONDS = 35;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const DEFUSE_KIT_SECONDS = 2.5;
export const DEFUSE_KIT_PRICE = DEFUSEKIT_PRICE;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 12;
const WIN_BONUS = 3250;
const LOSS_BONUS = 1900;
const KILL_BONUS = 300;
const PLANT_BONUS = 300;
const DEFUSE_BONUS = 300;
const BANDAGE_PRICE = 300;
const MEDKIT_PRICE = 400;

// Keys 1–6 are the core buy keys (unchanged from v3 core): rifle, smg, sniper,
// frag grenade, armour, defuse kit. The extra items (shotgun, DMR, smoke,
// flash, bandage, medkit) are click-only in the buy menu (key '') so the
// live-phase keys stay free: Digit1/2/3 throw grenades, Digit4/5/6 heal.

export const BUY_ITEMS = [
  { id: 'rifle', name: 'VK-47 Rifle', desc: 'Accurate automatic rifle', price: WEAPONS.rifle.price, key: '1', cat: 'rifles' },
  { id: 'smg', name: 'Raptor-9 SMG', desc: 'Fast close-range spray', price: WEAPONS.smg.price, key: '2', cat: 'close' },
  { id: 'sniper', name: 'Longshot Sniper', desc: 'One shot, long range', price: WEAPONS.sniper.price, key: '3', cat: 'rifles' },
  { id: 'shotgun', name: 'S12K Shotgun', desc: '8-pellet close-range blast', price: WEAPONS.shotgun.price, key: '', cat: 'close' },
  { id: 'dmr', name: 'DMR-14 Marksman', desc: 'Semi-auto long-range precision', price: WEAPONS.dmr.price, key: '', cat: 'rifles' },
  { id: 'grenade', name: 'Frag Grenade', desc: 'Throwable, big blast', price: GRENADE_PRICE, key: '4', cat: 'grenades' },
  { id: 'smoke', name: 'Smoke Grenade', desc: 'Blocks sight for 15s', price: SMOKE_PRICE, key: '', cat: 'grenades' },
  { id: 'flash', name: 'Flash Grenade', desc: 'Blinds anyone looking at it', price: FLASH_PRICE, key: '', cat: 'grenades' },
  { id: 'armor', name: 'Kevlar Vest', desc: '+50 armour', price: ARMOR_PRICE, key: '5', cat: 'gear' },
  { id: 'defusekit', name: 'Defuse Kit', desc: 'Defuse in 2.5s instead of 5s', price: DEFUSE_KIT_PRICE, key: '6', cat: 'gear' },
  { id: 'bandage', name: 'Bandage', desc: '+25 HP over 3s (key 4 to use)', price: BANDAGE_PRICE, key: '', cat: 'medical' },
  { id: 'medkit', name: 'Medkit', desc: 'Full HP over 6s (key 5 to use)', price: MEDKIT_PRICE, key: '', cat: 'medical' },
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
    // Per-type grenade inventory (frag kept in sync with `grenades` above).
    grenadeCounts: { frag: 0, smoke: 0, flash: 0 },
    // Halftime side swap: rounds 1–6 Vanguard attacks, rounds 7–12 Crimson
    // attacks. `attackingTeam` is the side that plants; the other defends.
    swapped: false,
    attackingTeam: 'vanguard',
    bombPlanted: false,
    bombSite: null,
    bombTimer: 0,
    bombCarrier: 'player',
    bombDroppedAt: null,
    // Defuse: base 5s; a defuse kit bought by the player's team halves it.
    // Exposed so the HUD can read the current value.
    defuseSeconds: DEFUSE_SECONDS,
    hasDefuseKit: false,
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
    state.bombCarrier = state.attackingTeam === 'vanguard' ? 'player' : 'bot';
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
    if (
      state.vanguardWins >= WIN_ROUNDS
      || state.crimsonWins >= WIN_ROUNDS
      || state.round >= MAX_ROUNDS
    ) {
      state.matchOver = true;
      // First to 5 normally decides it; at the 12-round cap the side with
      // more rounds wins, and a tie goes to Crimson (defenders hold the site).
      state.matchWinner = state.vanguardWins > state.crimsonWins ? 'vanguard' : 'crimson';
      events.onMatchEnd(state.matchWinner, state);
    }
  }

  function nextRound() {
    if (state.matchOver) return;
    state.round += 1;
    // Halftime: at round 7 the sides swap — Crimson attacks, Vanguard defends.
    if (state.round === 7) {
      state.swapped = true;
      state.attackingTeam = 'crimson';
    }
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
          // The bomb detonating wins the round for the attacking side.
          if (state.bombTimer <= 0) endRound(state.attackingTeam, 'bomb');
        } else if (state.timer <= 0) {
          // Time expiring wins the round for the defending side.
          endRound(state.attackingTeam === 'vanguard' ? 'crimson' : 'vanguard', 'time');
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
      // A defuse wins the round for the defending side.
      endRound(state.attackingTeam === 'vanguard' ? 'crimson' : 'vanguard', 'defuse');
      return true;
    },
    // The player's team buys a defuse kit: defusing then takes 2.5s.
    buyDefuseKit() {
      state.hasDefuseKit = true;
      state.defuseSeconds = DEFUSE_KIT_SECONDS;
    },
    buy(itemId) {
      if (state.phase !== 'buy') return { ok: false, reason: 'buy time is over' };
      const item = BUY_ITEMS.find((i) => i.id === itemId);
      if (!item) return { ok: false, reason: 'no such item' };
      if (state.money < item.price) return { ok: false, reason: 'not enough money' };
      if (itemId === 'grenade' && state.grenadeCounts.frag >= 2) return { ok: false, reason: 'carrying 2 frag grenades already' };
      if (itemId === 'smoke' && state.grenadeCounts.smoke >= 2) return { ok: false, reason: 'carrying 2 smoke grenades already' };
      if (itemId === 'flash' && state.grenadeCounts.flash >= 2) return { ok: false, reason: 'carrying 2 flash grenades already' };
      if (itemId === 'armor' && state.armor >= 50) return { ok: false, reason: 'armour already full' };
      if (itemId === 'defusekit' && state.hasDefuseKit) return { ok: false, reason: 'defuse kit already owned' };
      state.money -= item.price;
      if (itemId === 'grenade') {
        state.grenades += 1;
        state.grenadeCounts.frag += 1;
      } else if (itemId === 'smoke') state.grenadeCounts.smoke += 1;
      else if (itemId === 'flash') state.grenadeCounts.flash += 1;
      else if (itemId === 'armor') state.armor = 50;
      else if (itemId === 'defusekit') this.buyDefuseKit();
      // Bandage/medkit: money is taken here; main.js adds them to the heal
      // inventory (heal.js) on a successful buy.
      else if (itemId === 'bandage' || itemId === 'medkit') { /* handled by main.js */ }
      else events.onBuyWeapon(itemId);
      events.onBuy(item, state.money);
      return { ok: true };
    },
    dropBomb(at) {
      // Either side's carrier can drop the bomb: 'player' (Vanguard attacks)
      // or 'bot' (the attacking team's bot — Crimson after halftime).
      if (state.bombCarrier !== 'player' && state.bombCarrier !== 'bot') return;
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
