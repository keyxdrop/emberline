// EMBERLINE look plan, in one place: a dusk foundry — warm dark ground, amber ember,
// cool ashen teal for the enemy team. The same names are the CSS custom properties
// in index.html; no other colour appears in the code except through these.
export const PALETTE = {
  canvas: '#1e1710',
  surface: '#2b2115',
  hairline: '#3a2c1c',
  ink: '#f2e8d5',
  muted: '#a08a6c',
  accent: '#ff9a2a',
  ashen: '#6fd3e0',
  danger: '#e5484d',
  rust: '#8a4a2e',
  steel: '#6e6250',
  soot: '#14100c',
  lamp: '#ffd9a0',
};

export function shade(name) {
  return PALETTE[name];
}
