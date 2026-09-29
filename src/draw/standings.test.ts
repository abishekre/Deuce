import { describe, expect, it } from 'vitest';

import { makeRandom } from '../rules/testing';

import { groupStandings, type GroupResult } from './standings';

/** `winner` beat `loser`, with each game's points from the winner's side. */
const beat = (winner: string, loser: string, ...games: Array<[number, number]>): GroupResult => ({
  a: winner,
  b: loser,
  winner,
  outcome: 'normal',
  games: games.map(([a, b]) => ({ a, b })),
});

const twoNil = (winner: string, loser: string) => beat(winner, loser, [21, 10], [21, 10]);

const summary = (standings: ReturnType<typeof groupStandings>) =>
  standings.map((s) => `${s.rank ?? '-'} ${s.entry} ${s.decidedBy}`);

describe('16.2.1 — matches won', () => {
  it('ranks by wins when nobody is level', () => {
    const standings = groupStandings(['A', 'B', 'C'], [twoNil('A', 'B'), twoNil('A', 'C'), twoNil('B', 'C')]);
    expect(summary(standings)).toEqual(['1 A matches', '2 B matches', '3 C matches']);
  });
});

describe('16.2.2 — two level', () => {
  it('ranks the head-to-head winner higher, even with the worse games difference', () => {
    const results = [
      beat('A', 'B', [21, 19], [19, 21], [21, 19]),
      beat('A', 'C', [21, 19], [19, 21], [21, 19]),
      twoNil('D', 'A'),
      twoNil('B', 'C'),
      twoNil('B', 'D'),
      twoNil('C', 'D'),
    ];
    const standings = groupStandings(['A', 'B', 'C', 'D'], results);

    // A and B both won twice; B's games difference is +3 to A's 0, but A beat B.
    expect(summary(standings)).toEqual(['1 A headToHead', '2 B headToHead', '3 C headToHead', '4 D headToHead']);
    expect(standings.find((s) => s.entry === 'B')).toMatchObject({ gamesWon: 5, gamesLost: 2 });
  });
});

describe('16.2.3 — three or more level: games difference', () => {
  it('separates a three-way cycle on games difference', () => {
    const results = [
      beat('A', 'B', [21, 10], [21, 10]),
      beat('B', 'C', [21, 10], [10, 21], [21, 10]),
      beat('C', 'A', [21, 10], [10, 21], [21, 10]),
    ];
    // Games: A +1, C 0, B -1.
    expect(summary(groupStandings(['A', 'B', 'C'], results))).toEqual(['1 A games', '2 C games', '3 B games']);
  });

  it('16.2.3.1 — falls back to head-to-head when games difference leaves two level', () => {
    const results = [
      beat('A', 'B', [21, 10], [21, 10]),
      beat('B', 'C', [21, 10], [10, 21], [21, 10]),
      beat('C', 'A', [21, 10], [21, 10]),
      beat('A', 'D', [21, 10], [10, 21], [21, 10]),
      twoNil('B', 'D'),
      twoNil('C', 'D'),
    ];
    // Three on two wins. Games: C +3, A +1, B +1 — so A and B go to head-to-head.
    expect(summary(groupStandings(['A', 'B', 'C', 'D'], results))).toEqual([
      '1 C games',
      '2 A headToHead',
      '3 B headToHead',
      '4 D matches',
    ]);
  });
});

describe('16.2.4 — three or more still level: points difference, then lots', () => {
  const cycle = [
    beat('A', 'B', [21, 10], [15, 21], [21, 10]),
    beat('B', 'C', [21, 19], [19, 21], [21, 19]),
    beat('C', 'A', [21, 19], [19, 21], [21, 19]),
  ];

  it('separates on points when games difference is level too', () => {
    // Games all 3-3. Points: A +14, C 0, B -14.
    const standings = groupStandings(['A', 'B', 'C'], cycle);

    expect(summary(standings)).toEqual(['1 A points', '2 C points', '3 B points']);
    expect(standings[0]).toMatchObject({ pointsWon: 116, pointsLost: 102 });
  });

  const deadlock = [twoNil('A', 'B'), twoNil('B', 'C'), twoNil('C', 'A')];

  it('reports a complete deadlock as a tie rather than inventing an order', () => {
    expect(summary(groupStandings(['A', 'B', 'C'], deadlock))).toEqual(['1 A tied', '1 B tied', '1 C tied']);
  });

  it('applies the lots the organiser drew', () => {
    expect(summary(groupStandings(['A', 'B', 'C'], deadlock, ['B', 'C', 'A']))).toEqual([
      '1 B lots',
      '2 C lots',
      '3 A lots',
    ]);
  });
});

describe('16.2.5 — not completing the group', () => {
  it('deletes every result of a player who retires, including their wins', () => {
    const results = [
      twoNil('A', 'B'),
      twoNil('A', 'C'),
      twoNil('B', 'C'),
      twoNil('D', 'B'),
      { a: 'A', b: 'D', winner: 'A', outcome: 'retired' as const, games: [{ a: 11, b: 4 }] },
    ];
    const standings = groupStandings(['A', 'B', 'C', 'D'], results);

    expect(summary(standings)).toEqual(['1 A matches', '2 B matches', '3 C matches', '- D withdrawn']);
    // B's loss to D is gone with the rest of D's results; A's win over D is gone too.
    expect(standings.find((s) => s.entry === 'B')).toMatchObject({ played: 2, won: 1, lost: 1 });
    expect(standings.find((s) => s.entry === 'A')).toMatchObject({ played: 2, won: 2 });
  });

  it('treats a walkover the same way', () => {
    const results = [twoNil('A', 'B'), { a: 'C', b: 'A', winner: 'C', outcome: 'walkover' as const, games: [] }];
    const standings = groupStandings(['A', 'B', 'C'], results);

    expect(standings.find((s) => s.entry === 'A')).toMatchObject({ rank: null, withdrawn: true });
    expect(standings.find((s) => s.entry === 'B')).toMatchObject({ played: 0 });
  });
});

describe('a group still being played', () => {
  it('shows two level who have not met as tied, sharing the rank', () => {
    const standings = groupStandings(['A', 'B', 'C'], [twoNil('A', 'C'), twoNil('B', 'C')]);
    expect(summary(standings)).toEqual(['1 A tied', '1 B tied', '3 C matches']);
  });

  it('never uses lots in place of a match that has not been played', () => {
    const standings = groupStandings(['A', 'B', 'C'], [twoNil('A', 'C'), twoNil('B', 'C')], ['B', 'A', 'C']);
    expect(standings[0]?.decidedBy).toBe('tied');
  });
});

describe('invariants over random complete groups', () => {
  const random = makeRandom(0x57a4d);

  function randomGroup(size: number) {
    const ids = Array.from({ length: size }, (_, i) => String.fromCharCode(65 + i));
    const results: GroupResult[] = [];
    for (let i = 0; i < size; i++) {
      for (let j = i + 1; j < size; j++) {
        const [winner, loser] = random.next() < 0.5 ? [ids[i]!, ids[j]!] : [ids[j]!, ids[i]!];
        const games: Array<[number, number]> = [[21, random.int(0, 19)]];
        if (random.next() < 0.4) games.push([random.int(0, 19), 21]);
        games.push([21, random.int(0, 19)]);
        results.push(beat(winner, loser, ...games));
      }
    }
    return { ids, results };
  }

  it('ranks every entry exactly once, and more wins always ranks higher', () => {
    for (let n = 0; n < 500; n++) {
      const { ids, results } = randomGroup(random.int(3, 6));
      const standings = groupStandings(ids, results);

      expect(standings.map((s) => s.entry).sort()).toEqual([...ids].sort());
      for (let i = 1; i < standings.length; i++) {
        const above = standings[i - 1]!;
        const below = standings[i]!;
        expect(above.rank!).toBeLessThanOrEqual(below.rank!);
        if (above.won !== below.won) expect(above.won).toBeGreaterThan(below.won);
      }
    }
  });

  it('always lets a pair level on wins be split by their own match', () => {
    for (let n = 0; n < 500; n++) {
      const { ids, results } = randomGroup(random.int(3, 6));
      const standings = groupStandings(ids, results);

      for (const s of standings) {
        const level = standings.filter((t) => t.won === s.won);
        if (level.length !== 2) continue;
        const [first, second] = level;
        const match = results.find((r) => [r.a, r.b].includes(first!.entry) && [r.a, r.b].includes(second!.entry));
        expect(match?.winner).toBe(first!.entry);
      }
    }
  });

  it('resolves every complete group fully once lots are drawn', () => {
    for (let n = 0; n < 500; n++) {
      const { ids, results } = randomGroup(random.int(3, 6));
      const standings = groupStandings(ids, results, ids);

      expect(standings.some((s) => s.decidedBy === 'tied')).toBe(false);
      expect(new Set(standings.map((s) => s.rank)).size).toBe(ids.length);
    }
  });

  it('gives the same standings whatever order results arrive in', () => {
    for (let n = 0; n < 200; n++) {
      const { ids, results } = randomGroup(random.int(3, 6));
      const shuffled = [...results].sort(() => random.next() - 0.5);

      expect(groupStandings(ids, shuffled)).toEqual(groupStandings(ids, results));
    }
  });
});
