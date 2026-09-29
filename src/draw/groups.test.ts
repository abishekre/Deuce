import { describe, expect, it } from 'vitest';

import { makeRandom } from '../rules/testing';

import { allocateGroups, DrawError, roundRobin, type DrawEntry } from './groups';

const entries = (count: number, seeds = 0): DrawEntry[] =>
  Array.from({ length: count }, (_, i) => ({ id: `e${i + 1}`, seed: i < seeds ? i + 1 : null }));

describe('allocateGroups', () => {
  it('snakes the seeds so each group gets one from every tier', () => {
    const groups = allocateGroups(entries(8, 8), 4, makeRandom(1).next);

    expect(groups).toEqual([
      ['e1', 'e8'],
      ['e2', 'e7'],
      ['e3', 'e6'],
      ['e4', 'e5'],
    ]);
  });

  it('keeps group sizes within one of each other for any entry count', () => {
    const random = makeRandom(0x9a0);
    for (let n = 0; n < 500; n++) {
      const groupCount = random.int(1, 8);
      const count = random.int(groupCount * 2, groupCount * 6);
      const sizes = allocateGroups(entries(count, random.int(0, count)), groupCount, random.next).map((g) => g.length);

      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(count);
    }
  });

  it('never puts two of the top seeds in one group', () => {
    const random = makeRandom(0x5eed);
    for (let n = 0; n < 200; n++) {
      const groupCount = random.int(2, 8);
      const groups = allocateGroups(entries(groupCount * 4, groupCount), groupCount, random.next);
      const topSeedsPerGroup = groups.map((g) => g.filter((id) => Number(id.slice(1)) <= groupCount).length);

      expect(topSeedsPerGroup.every((count) => count === 1)).toBe(true);
    }
  });

  it('replays exactly from the same random seed, so a disputed draw can be shown again', () => {
    const draw = (seed: number) => allocateGroups(entries(14, 3), 4, makeRandom(seed).next);

    expect(draw(42)).toEqual(draw(42));
    expect(draw(42)).not.toEqual(draw(43));
  });

  it('refuses a group of one', () => {
    expect(() => allocateGroups(entries(5), 3, Math.random)).toThrow(DrawError);
    expect(() => allocateGroups(entries(5), 3, Math.random)).toThrow(/at least 2/);
  });

  it('refuses the same entry twice', () => {
    expect(() => allocateGroups([{ id: 'x' }, { id: 'x' }, { id: 'y' }, { id: 'z' }], 2, Math.random)).toThrow(
      /twice/,
    );
  });
});

describe('roundRobin', () => {
  const key = ([a, b]: readonly [string, string]) => [a, b].sort().join('-');

  it('plays every pairing exactly once, and nobody twice in a round', () => {
    for (let size = 2; size <= 8; size++) {
      const group = Array.from({ length: size }, (_, i) => `p${i}`);
      const rounds = roundRobin(group);
      const all = rounds.flat().map(key);

      expect(all.length).toBe((size * (size - 1)) / 2);
      expect(new Set(all).size).toBe(all.length);
      for (const round of rounds) {
        const players = round.flat();
        expect(new Set(players).size).toBe(players.length);
      }
    }
  });

  it('gives a group of four three rounds of two matches', () => {
    expect(roundRobin(['A', 'B', 'C', 'D'])).toEqual([
      [
        ['A', 'D'],
        ['B', 'C'],
      ],
      [
        ['A', 'C'],
        ['D', 'B'],
      ],
      [
        ['A', 'B'],
        ['C', 'D'],
      ],
    ]);
  });

  it('sits one player out per round in an odd group', () => {
    const rounds = roundRobin(['A', 'B', 'C']);

    expect(rounds).toHaveLength(3);
    expect(rounds.every((round) => round.length === 1)).toBe(true);
  });
});
