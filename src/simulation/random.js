/**
 * random.js
 * Seeded random numbers for the simulation (assumptions SIM-01, SIM-02).
 *
 * Every random process in the engine draws from its own named stream, for
 * example 'reject:M2' for the quality gate of M2. A stream's sequence depends
 * only on the run seed and the stream name. So adding a new random process
 * later (for example breakdowns, 'failure:M3') does not change the reject
 * sequence, and two configurations run with the same seed are compared fairly
 * ("common random numbers").
 *
 * Generator: mulberry32 (32-bit state, fast, good enough for a simulation).
 * Stream state: FNV-1a hash of the name, mixed with the seed.
 */

export const DEFAULT_SEED = 1;

// Seed 0 is valid (the headless helper's default), so never use `seed || x`.
export function normaliseSeed(seed) {
  return Number.isFinite(seed) ? Math.trunc(seed) : DEFAULT_SEED;
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Final mixer of MurmurHash3: spreads small seeds (0, 1, 2, ...) over 32 bits.
function mix32(x) {
  x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

export function mulberry32(state) {
  let a = state >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;   // [0, 1)
  };
}

/**
 * createRandom(seed) → { seed, stream(name) }
 * stream(name) returns a function () => number in [0, 1). Calling stream()
 * twice with the same name returns the same generator object.
 */
export function createRandom(seed) {
  const s = normaliseSeed(seed);
  const streams = new Map();
  return {
    seed: s,
    stream(name) {
      let g = streams.get(name);
      if (!g) {
        g = mulberry32(mix32(fnv1a(name) ^ mix32(s >>> 0)));
        streams.set(name, g);
      }
      return g;
    },
  };
}
