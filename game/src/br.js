// Battle Royale match flow for DUSTLINE v2. Replaces rounds.js (buy time, live
// round, bomb plant/defuse, round wins). One match, 12 players, last one alive
// wins. The blue zone (zone.js) does the shrinking; this module only tracks
// the match phase, the alive count, the clock, and the winner/placement.
// Dependency-free: no three.js import, no network, no DOM.
export const TOTAL_PLAYERS = 12;

export function createBR(events) {
  const ev = events || {};
  const state = {
    phase: 'drop', // 'drop' | 'live' | 'over'
    alive: TOTAL_PLAYERS,
    total: TOTAL_PLAYERS,
    winner: null,
    placement: null,
    matchTime: 0,
  };

  // Winner supplied by the coordinator before checkEnd() (used when the last
  // elimination leaves one survivor whose name only the coordinator knows).
  let pendingWinner = null;
  let pendingIsPlayer = false;

  function call(name, ...args) {
    if (typeof ev[name] === 'function') ev[name](...args);
  }

  function startMatch() {
    state.phase = 'drop';
    state.alive = TOTAL_PLAYERS;
    state.total = TOTAL_PLAYERS;
    state.winner = null;
    state.placement = null;
    state.matchTime = 0;
    pendingWinner = null;
    pendingIsPlayer = false;
    call('onMatchStart');
  }

  // The drop phase lasts ~3s; the coordinator calls this to go live.
  function setLive() {
    if (state.phase === 'drop') state.phase = 'live';
  }

  // One player (a bot, or the player) was eliminated. Decrements the alive
  // count and notifies the HUD. Does NOT end the match — the coordinator
  // decides that by calling checkEnd() / endMatch().
  function onEliminated(name, isPlayer) {
    if (state.phase === 'over') return;
    state.alive = Math.max(0, state.alive - 1);
    call('onAliveChange', state.alive);
  }

  // Coordinator-supplied winner, stored so checkEnd() can finish the match.
  function setWinner(name, isPlayer) {
    pendingWinner = name;
    pendingIsPlayer = !!isPlayer;
  }

  // Finish the match. playerPlacement is computed by the coordinator: 1 if
  // the player won, otherwise the alive count at the moment the player died.
  function endMatch(winnerName, isPlayer, playerPlacement) {
    if (state.phase === 'over') return;
    state.phase = 'over';
    state.winner = winnerName != null ? winnerName : pendingWinner;
    state.placement = playerPlacement != null ? playerPlacement : null;
    call('onMatchEnd', state.winner, !!isPlayer, state.placement);
  }

  // End the match when only one player is left. The coordinator either passes
  // the winner here or called setWinner(name, isPlayer) beforehand.
  function checkEnd(winnerName, isPlayer, playerPlacement) {
    if (state.phase === 'over') return false;
    if (state.alive > 1) return false;
    if (winnerName != null) setWinner(winnerName, isPlayer);
    endMatch(pendingWinner, pendingIsPlayer, playerPlacement);
    return true;
  }

  return {
    state,
    startMatch,
    setLive,
    onEliminated,
    setWinner,
    checkEnd,
    endMatch,
    update(dt) {
      if (state.phase === 'live') state.matchTime += dt;
      return state;
    },
  };
}
