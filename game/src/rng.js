// rng.js — one seeded random stream for the whole game. Matches, bot choices
// and staged screenshots all draw from here, so a seed rebuilds the same yard:
// the screenshot scenes pass ?seed= and get the same frame every single run.

let state = 123456789;

export function seedRandom(seed) {
  state = (Math.floor(Math.abs(seed)) % 2147483646) + 1;
}

// mulberry-style step: cheap, deterministic, and good enough for game feel.
export function rand() {
  state = (state * 48271) % 2147483647;
  return (state - 1) / 2147483646;
}

export function randRange(min, max) {
  return min + rand() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(randRange(min, max + 1));
}

export function pick(list) {
  return list[Math.floor(rand() * list.length)];
}

// Fill a callout template's {slots} from a bag of values.
export function fillLine(template, bag) {
  return template.replace(/\{(\w+)\}/g, (whole, key) => (bag[key] !== undefined ? bag[key] : whole));
}
