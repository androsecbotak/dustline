// Healing items + boost, PUBG-style. Pure logic: no scene, no THREE, no DOM.
// The coordinator owns health and movement/fire input; this module owns the
// inventory, the channel timer, and the boost meter. Healing applies at
// channel completion (nothing heals mid-channel), and moving or firing
// cancels the channel via cancel() with no refund and no effect.
export const CHANNEL_TIMES = {
  bandage: 3, // +25 HP at completion
  medkit: 6,  // heals to full HP at completion
  drink: 4,   // +50 boost and +10 HP at completion
};

export const BANDAGE_HEAL = 25;
export const DRINK_HEAL = 10;
export const DRINK_BOOST = 50;
export const MAX_BOOST = 100;
export const BOOST_DECAY_PER_SEC = 1.5;
export const BOOST_HEAL_MULTIPLIER = 1.5;

export function createHeal() {
  const inventory = { bandage: 0, medkit: 0, drink: 0 };
  let channel = null; // { item, left, total } while channeling, else null
  let boost = 0; // 0-100
  let onCompleteCb = null;

  function add(item, n = 1) {
    if (!(item in inventory)) return { ...inventory };
    inventory[item] += n;
    return { ...inventory };
  }

  function getHealthValue(getHealth) {
    if (typeof getHealth === 'function') return getHealth();
    return getHealth; // also accept a plain number
  }

  // timeScale: coordinator passes boostHealMultiplier() here so a boosted
  // player channels faster (channel time = base / multiplier).
  function startUse(item, getHealth, maxHealth, timeScale = 1) {
    if (!(item in inventory)) return { ok: false, reason: 'unknown item' };
    if (inventory[item] <= 0) return { ok: false, reason: 'none left' };
    if (channel) return { ok: false, reason: 'already healing' };
    if (item === 'medkit' && getHealthValue(getHealth) >= maxHealth) {
      return { ok: false, reason: 'already full' };
    }
    inventory[item] -= 1; // consumed on start, no refund on cancel
    const total = CHANNEL_TIMES[item] / Math.max(1, timeScale);
    channel = { item, left: total, total };
    return { ok: true, item, channelTime: total };
  }

  function update(dt, getHealth, maxHealth) {
    // Boost always decays, even while channeling.
    if (boost > 0) boost = Math.max(0, boost - BOOST_DECAY_PER_SEC * dt);
    if (!channel) return null;
    channel.left -= dt;
    if (channel.left > 0) return null;

    const finished = channel.item;
    channel = null;
    let healAmount = 0;
    let boostGain = 0;
    if (finished === 'bandage') {
      healAmount = BANDAGE_HEAL;
    } else if (finished === 'medkit') {
      // Heal to full: exact amount needs current health. If the coordinator
      // passed health access, compute it; otherwise null means "heal to full".
      if (getHealth !== undefined && maxHealth !== undefined) {
        healAmount = Math.max(0, maxHealth - getHealthValue(getHealth));
      } else {
        healAmount = null;
      }
    } else if (finished === 'drink') {
      healAmount = DRINK_HEAL;
      boostGain = DRINK_BOOST;
      boost = Math.min(MAX_BOOST, boost + DRINK_BOOST);
    }
    const event = { done: true, item: finished, healAmount, boostGain };
    if (onCompleteCb) onCompleteCb(event);
    return event;
  }

  // Cancel the current channel: no refund, no effect. The coordinator calls
  // this when the player moves (WASD) or fires.
  function cancel() {
    if (!channel) return { cancelled: false, item: null };
    const item = channel.item;
    channel = null;
    return { cancelled: true, item };
  }

  function onComplete(fn) {
    onCompleteCb = fn;
  }

  function getBoost() {
    return boost;
  }

  // While boost > 0, bandage/medkit channel 50% faster. The coordinator
  // reads this and passes it as timeScale to startUse().
  function boostHealMultiplier() {
    return boost > 0 ? BOOST_HEAL_MULTIPLIER : 1;
  }

  function getChannel() {
    return channel ? { ...channel } : null;
  }

  function getCounts() {
    return { ...inventory };
  }

  return {
    add,
    startUse,
    update,
    cancel,
    onComplete,
    getBoost,
    boostHealMultiplier,
    getChannel,
    getCounts,
  };
}
