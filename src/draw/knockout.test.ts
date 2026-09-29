import { describe, expect, it } from 'vitest';

import {
  bracketMatches,
  bracketSize,
  knockoutFromGroups,
  matchKey,
  meetingRound,
  resolveBracket,
  seededPositions,
  seedOrder,
  type Qualifier,
} from './knockout';

describe('bracketSize', () => {
  it('rounds up to the next power of two, and never below a final', () => {
    expect([1, 2, 3, 4, 5, 8, 9, 16, 17].map(bracketSize)).toEqual([2, 2, 4, 4, 8, 8, 16, 16, 32]);
  });
});

describe('seedOrder', () => {
  it('matches the standard draw sheets', () => {
    expect(seedOrder(2)).toEqual([1, 2]);
    expect(seedOrder(4)).toEqual([1, 4, 3, 2]);
    expect(seedOrder(8)).toEqual([1, 8, 5, 4, 3, 6, 7, 2]);
    expect(seedOrder(16)).toEqual([1, 16, 9, 8, 5, 12, 13, 4, 3, 14, 11, 6, 7, 10, 15, 2]);
  });

  it('keeps the top 2^k seeds apart until the last k rounds, at every size', () => {
    for (let size = 2; size <= 128; size *= 2) {
      const order = seedOrder(size);
      const rounds = Math.log2(size);

      expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: size }, (_, i) => i + 1));
      for (let i = 0; i < size; i += 2) expect(order[i]! + order[i + 1]!).toBe(size + 1);

      for (let k = 1; k <= rounds; k++) {
        const top = Array.from({ length: 2 ** k }, (_, i) => order.indexOf(i + 1));
        for (const p of top) {
          for (const q of top) {
            if (p !== q) expect(meetingRound(p, q)).toBeGreaterThan(rounds - k);
          }
        }
      }
    }
  });
});

describe('seededPositions', () => {
  it('gives the byes to the top seeds', () => {
    expect(seededPositions(['s1', 's2', 's3', 's4', 's5', 's6'])).toEqual(['s1', null, 's5', 's4', 's3', 's6', null, 's2']);
  });
});

const qualifiersFor = (groups: number, perGroup: number): Qualifier[] =>
  Array.from({ length: groups }, (_, g) =>
    Array.from({ length: perGroup }, (_, p) => ({ entry: `${'ABCDEFGH'[g]}${p + 1}`, group: g, place: p + 1 })),
  ).flat();

describe('knockoutFromGroups', () => {
  it('crosses two groups over in the semi-finals', () => {
    expect(knockoutFromGroups(qualifiersFor(2, 2))).toEqual(['A1', 'B2', 'A2', 'B1']);
  });

  it('keeps each group pair apart until the final with four groups', () => {
    expect(knockoutFromGroups(qualifiersFor(4, 2))).toEqual(['A1', 'C2', 'B2', 'D1', 'C1', 'A2', 'D2', 'B1']);
  });

  it('gives the byes to group winners when the count is uneven', () => {
    expect(knockoutFromGroups(qualifiersFor(3, 2))).toEqual(['A1', null, 'C2', 'B2', 'C1', 'A2', null, 'B1']);
  });

  it('puts every group winner and runner-up in opposite halves, for any number of groups', () => {
    for (let groups = 2; groups <= 8; groups++) {
      for (const perGroup of [2, 3]) {
        const positions = knockoutFromGroups(qualifiersFor(groups, perGroup));
        const final = Math.log2(positions.length);

        for (let g = 0; g < groups; g++) {
          const letter = 'ABCDEFGH'[g];
          const winner = positions.indexOf(`${letter}1`);
          const second = positions.indexOf(`${letter}2`);
          expect(meetingRound(winner, second), `${groups} groups × ${perGroup}, group ${letter}`).toBe(final);
        }
      }
    }
  });

  it('places everyone exactly once and never pairs two byes', () => {
    for (let groups = 1; groups <= 8; groups++) {
      for (let perGroup = 1; perGroup <= 3; perGroup++) {
        const qualifiers = qualifiersFor(groups, perGroup);
        if (qualifiers.length < 2) continue;
        const positions = knockoutFromGroups(qualifiers);

        expect(positions.filter(Boolean).sort()).toEqual(qualifiers.map((q) => q.entry).sort());
        for (let i = 0; i < positions.length; i += 2) {
          expect(positions[i] === null && positions[i + 1] === null).toBe(false);
        }
      }
    }
  });
});

describe('resolveBracket', () => {
  const rounds = bracketMatches(['A1', null, 'C2', 'B2', 'C1', 'A2', null, 'B1']);

  it('advances byes without a match being played', () => {
    const [first, second] = resolveBracket(rounds, new Map());

    expect(first![0]).toMatchObject({ a: 'A1', b: null, winner: 'A1', bye: true });
    expect(second![0]).toMatchObject({ a: 'A1', b: undefined, winner: undefined });
    expect(second![1]).toMatchObject({ a: undefined, b: 'B1' });
  });

  it('carries recorded winners through to the final', () => {
    const winners = new Map([
      [matchKey(1, 1), 'C2'],
      [matchKey(1, 2), 'A2'],
      [matchKey(2, 0), 'C2'],
      [matchKey(2, 1), 'B1'],
      [matchKey(3, 0), 'B1'],
    ]);
    const resolved = resolveBracket(rounds, winners);
    const final = resolved[2]![0]!;

    expect(final).toMatchObject({ a: 'C2', b: 'B1', winner: 'B1' });
  });

  it('refuses a winner who was not in the match', () => {
    expect(() => resolveBracket(rounds, new Map([[matchKey(1, 1), 'A1']]))).toThrow(/not in it/);
  });
});
