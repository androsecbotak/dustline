// The look plan, in one place. DUSTLINE is a desert outpost at dusk: warm sand and
// terracotta under a low amber sun, cool blue-grey shadows. The same names are the CSS
// custom properties in index.html. Team colours are separate: Vanguard (the player's
// team) is blue, Crimson (the enemy) is red, so a bot reads as friend or foe at a glance.
export const PALETTE = {
  canvas: '#2b3542',
  surface: '#8a6a48',
  hairline: '#4a3a28',
  ink: '#f2e8d8',
  muted: '#a8a29a',
  accent: '#f0a830',
  sand: '#c8a06a',
  sandDark: '#a8814f',
  concrete: '#9a8a76',
  concreteDark: '#6e6252',
  container: '#5a7a6e',
  containerRust: '#a8542f',
  wood: '#8a6a3f',
  metal: '#3a4048',
  skyTop: '#1e2a3a',
  skyHorizon: '#e8954a',
  vanguard: '#3a7bd5',
  crimson: '#d53a3a',
};

export function shade(name) {
  return PALETTE[name];
}
