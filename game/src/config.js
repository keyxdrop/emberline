// config.js — EMBERLINE's rulebook. Every tunable number and every line of shop
// copy lives in this one file, so the rest of the game reads as rules instead of
// magic numbers. If a value decides how a round feels, it is declared here.

export const TEAM = { EMBER: 'ember', ASHEN: 'ashen' };

export const MATCH = {
  roundsToWin: 5, // first side to five rounds takes the match
  buySeconds: 15, // shopping window before each round goes live
  roundSeconds: 100, // clock for an unplanted round; Ashen win if it runs out
  endSeconds: 5, // banner time between rounds
  plantSeconds: 3, // channel time to plant the Spark Charge
  defuseSeconds: 5, // channel time to pull the charge back out
  chargeSeconds: 30, // fuse once planted; then the Forge decides
  startMoney: 800,
  maxMoney: 9000,
  killReward: 300,
  plantReward: 300,
  winReward: 2700,
  lossReward: 1400,
};

// The armoury. damage is per pellet; interval is seconds between shots; spread is
// the half-angle of the shot cone in radians for a standing shooter; falloff is
// the distance band over which damage eases from full to 40 percent.
export const WEAPONS = {
  sidekick: {
    name: 'Sidekick', kind: 'Pistol', price: 0, damage: 24, interval: 0.32,
    auto: false, mag: 12, reserve: 48, reload: 1.1, spread: 0.012,
    falloff: [18, 42], pellets: 1, zoom: 1.0,
    blurb: 'Standard issue. Free, honest, and outclassed by everything below.',
  },
  cinder: {
    name: 'Cinder', kind: 'SMG', price: 950, damage: 19, interval: 0.075,
    auto: true, mag: 32, reserve: 96, reload: 1.6, spread: 0.03,
    falloff: [10, 30], pellets: 1, zoom: 1.0,
    blurb: 'Fast hands, close hearts: melts a rush before it forms.',
  },
  bellows: {
    name: 'Bellows', kind: 'Scattergun', price: 1100, damage: 11, interval: 0.85,
    auto: false, mag: 6, reserve: 30, reload: 2.4, spread: 0.055,
    falloff: [6, 20], pellets: 8, zoom: 1.0,
    blurb: 'Eight pellets of crowd control for tight corners and bad ideas.',
  },
  forgeline: {
    name: 'Forgeline', kind: 'Rifle', price: 2700, damage: 33, interval: 0.115,
    auto: true, mag: 30, reserve: 90, reload: 1.9, spread: 0.016,
    falloff: [24, 55], pellets: 1, zoom: 1.15,
    blurb: 'The all-round answer. Two taps, any range, no excuses.',
  },
  longspark: {
    name: 'Longspark', kind: 'DMR', price: 3200, damage: 78, interval: 0.95,
    auto: false, mag: 8, reserve: 32, reload: 2.2, spread: 0.003,
    falloff: [40, 90], pellets: 1, zoom: 1.9,
    blurb: 'One heavy bolt per breath. Punishes wide peeks down the long lanes.',
  },
  hailforge: {
    name: 'Hailforge', kind: 'LMG', price: 3400, damage: 26, interval: 0.09,
    auto: true, mag: 60, reserve: 120, reload: 3.4, spread: 0.034,
    falloff: [20, 48], pellets: 1, zoom: 1.05,
    blurb: 'Sixty rounds of area denial. Reloads on Sundays, plan ahead.',
  },
};

// The buy menu shows exactly these eight rows, in this order, every round.
export const BUY_ROWS = [
  { id: 'cinder', slot: 'weapon' },
  { id: 'bellows', slot: 'weapon' },
  { id: 'forgeline', slot: 'weapon' },
  { id: 'longspark', slot: 'weapon' },
  { id: 'hailforge', slot: 'weapon' },
  { id: 'grenade', slot: 'gear' },
  { id: 'armour', slot: 'gear' },
  { id: 'flash', slot: 'gear' },
];

export const GEAR = {
  grenade: {
    name: 'Pop Charge', kind: 'Grenade', price: 300, damage: 88, radius: 5.5,
    blurb: 'A pocket furnace: clears corners, site boxes and second thoughts.',
  },
  armour: {
    name: 'Slagweave Vest', kind: 'Armour', price: 650, absorb: 0.34,
    blurb: 'Woven furnace slag. Turns a third of every bullet into heat.',
  },
  flash: {
    name: 'Flash Charge', kind: 'Gadget', price: 200, blindSeconds: 2.4,
    blurb: 'Blinds everyone facing it for a breath. Look away, push in.',
  },
};

// Bot loadouts grow with the rounds: index is the round number capped at the
// last row. Each row is the weapon a bot carries and whether it wears a vest.
export const BOT_LOADOUTS = [
  { weapon: 'sidekick', armour: false },
  { weapon: 'cinder', armour: false },
  { weapon: 'bellows', armour: true },
  { weapon: 'forgeline', armour: true },
  { weapon: 'forgeline', armour: true },
  { weapon: 'hailforge', armour: true },
  { weapon: 'longspark', armour: true },
];

// Enemy aim sharpens as the match goes on: reaction time is multiplied by
// RAMP.step every round, never below RAMP.floor of its first-round value.
export const RAMP = { step: 0.96, floor: 0.75, baseReaction: 0.55 };

export const EMBER_NAMES = ['Vex', 'Marlo', 'Asha', 'Pyke'];
export const ASHEN_NAMES = ['Thorn', 'Grist', 'Hollow', 'Sable', 'Rook'];
export const PLAYER_NAME = 'You';

// Radio chatter. Bots speak on events; the coach module and the killfeed share
// this pool so the whole match sounds like one squad, not nine scripts.
export const CALLOUTS = {
  contact: [
    'Contact — {lane}!',
    'Eyes on {lane}, they are pushing!',
    'Movement {lane}, get ready!',
    'Hostiles {lane} — I see {foe}!',
  ],
  plantStart: [
    'Planting — cover me!',
    'Charge going down, watch the lanes!',
    'Setting the Spark, hold this ground!',
  ],
  planted: [
    'Charge is live! Fall back and guard it!',
    'Spark planted — thirty seconds, hold!',
    'It is in! Nobody lets them near it!',
  ],
  defuseStart: [
    'They are on the charge — stop them!',
    'Defuse attempt! Push the site, now!',
    'Hands on our Spark — interrupt it!',
  ],
  retreat: [
    'I am hit bad — falling back!',
    'Pulling out, I need a second!',
    'Too hot here — repositioning!',
  ],
  roundWin: [
    'Round ours. Breathe, rebuy, again.',
    'That is how Ember holds a yard.',
    'Clean work. Keep the money rolling.',
  ],
  roundLose: [
    'Round gone. Shake it off, next one is ours.',
    'They took that one — answer back.',
    'Regroup. We still have the economy.',
  ],
  matchPointUs: ['Match point, Ember. One more and the yard is ours.'],
  matchPointThem: ['Match point against us. Win this or go home.'],
  finalBlow: ['Final blow of the round.', 'Last one down.', 'And that settles the round.'],
};

export const LANES = { west: 'Slag Alley', mid: 'Furnace Row', east: 'Kiln Run', site: 'the Forge' };
