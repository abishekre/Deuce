import { appendRally } from './engine';
import type { Rally, Side } from './types';

/**
 * Seeded PRNG for the property tests.
 *
 * `Math.random` would make a failure unreproducible — exactly the wrong trade
 * for a scoring engine, where the interesting bugs live in rare sequences
 * (deuce past the cap, a decider that changes ends mid-game) that you want to
 * be able to replay from the seed printed in a CI log.
 *
 * mulberry32: small, fast, statistically fine for this purpose.
 */
export function makeRandom(seed: number) {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    /** Inclusive on both ends. */
    int: (min: number, max: number): number => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
  };
}

/** Build a rally log from a string of side letters, e.g. `'AABABB'`. */
export function ralliesFrom(winners: string): Rally[] {
  return [...winners].reduce<Rally[]>(
    (log, letter, index) => appendRally(log, `r${index}`, letter.toUpperCase() as Side),
    [],
  );
}

/** `'A'` repeated `count` times, for sweeps. */
export const sweep = (side: Side, count: number): string => side.repeat(count);
