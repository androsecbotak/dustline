// The look plan, in one place. DUSTLINE v3 is an abandoned desert oil refinery /
// mining outpost at dusk: warm rust-orange sand and terracotta under a low amber
// sun, cool blue-grey shadows, teal-painted steel as the contrasting accent
// (containers, tanks, corrugated sheds). The same names are the CSS custom
// properties in index.html. Team colours are separate: Vanguard (the player's
// team) is blue, Crimson (the enemy) is red, so a bot reads as friend or foe at a glance.
export const PALETTE = {
  canvas: '#4a382a',
  surface: '#8a6a48',
  hairline: '#4a3a28',
  ink: '#f2e8d8',
  muted: '#a8a29a',
  accent: '#ffb347',
  sand: '#cf9a5e',
  sandDark: '#a87a48',
  concrete: '#96826c',
  concreteDark: '#6b5b49',
  container: '#5a7a6e',
  containerRust: '#a8542f',
  wood: '#8a6a3f',
  metal: '#3a4048',
  skyTop: '#171f30',
  skyHorizon: '#f08a3c',
  // v3 refinery theme: teal steel, sandstone walls, rust, pipework, flare glow.
  teal: '#2f8f86',
  sandstone: '#b98d5f',
  sandstoneDark: '#8f6a42',
  rust: '#7a4a28',
  pipe: '#5e4632',
  flare: '#ff9e45',
  vanguard: '#3a7bd5',
  crimson: '#d53a3a',
};

export function shade(name) {
  return PALETTE[name];
}
