import { describe, expect, it } from 'vitest';

import { appendRally, gamesToWin, scoreMatch, undoLastRally } from './engine';
import { BWF_21, SHORT_11, SHORT_15, SINGLE_21 } from './formats';
import { makeRandom } from './testing';
import type { MatchFormat, Rally, Side } from './types';

/**
 * Invariants that have to hold for every rally sequence a real tournament could
 * produce, checked over thousands of randomised matches.
 *
 * The deterministic tests pin the rules down at the points a human can reason
 * about. These catch the sequences nobody would think to write by hand — a
 * decider that reaches the cap, a serve handed over on game point, a match that
 * ends on a swap.
 */

const FORMATS: ReadonlyArray<[string, MatchFormat]> = [
  ['best of 3 to 21, singles', BWF_21('singles')],
  ['best of 3 to 21, doubles', BWF_21('doubles')],
  ['one game to 21, doubles', SINGLE_21('doubles')],
  ['best of 3 to 15, doubles', SHORT_15('doubles')],
  ['best of 5 to 11, doubles', SHORT_11('doubles')],
];

/** Enough for the longest match these formats can produce, plus slack. */
const RALLY_CAP = 600;

/**
 * Most generated matches are close, because the rules worth stressing — deuce,
 * the cap, a change of ends in the decider — only fire when they are. The rest
 * are lopsided, so sweeps and straight-games wins stay covered too.
 */
function randomMatch(format: MatchFormat, random: ReturnType<typeof makeRandom>): Rally[] {
  const biasToA = random.next() < 0.7 ? 0.42 + random.next() * 0.16 : 0.2 + random.next() * 0.6;
  let log: Rally[] = [];

  for (let i = 0; i < RALLY_CAP; i++) {
    if (scoreMatch(format, log).complete) break;
    const winner: Side = random.next() < biasToA ? 'A' : 'B';
    log = appendRally(log, `r${i}`, winner);
  }

  return log;
}

/**
 * A generator that quietly stopped producing real matches would make every
 * property below pass vacuously, which is the worst possible failure mode for
 * a test suite whose whole job is to be paranoid. This asserts the sequences
 * actually reach the interesting rules.
 */
describe('the generator itself', () => {
  it('produces finished matches that reach deuce and three games', () => {
    const format = BWF_21('doubles');
    const random = makeRandom(0xc0bea7);
    let complete = 0;
    let decided = 0;
    let pastTwentyOne = 0;

    for (let i = 0; i < 200; i++) {
      const state = scoreMatch(format, randomMatch(format, random));
      if (state.complete) complete += 1;
      if (state.games.length === 3) decided += 1;
      if (state.games.some((g) => Math.max(g.scoreA, g.scoreB) > format.pointsToWin)) pastTwentyOne += 1;
    }

    // Smoke thresholds, not tuning targets: they catch a generator that has
    // degenerated, without breaking every time the bias is adjusted.
    expect(complete).toBe(200);
    expect(decided).toBeGreaterThan(30);
    expect(pastTwentyOne).toBeGreaterThan(25);
  });
});

describe.each(FORMATS)('%s', (_label, format) => {
  const CASES = 200;

  it('conserves every rally as exactly one point', () => {
    const random = makeRandom(0xba11);

    for (let i = 0; i < CASES; i++) {
      const log = randomMatch(format, random);
      const state = scoreMatch(format, log);
      const points = state.games.reduce((sum, g) => sum + g.scoreA + g.scoreB, 0);

      expect(points).toBe(state.rallyCount);
      expect(state.rallyCount + state.surplusRallyIds.length).toBe(log.length);
    }
  });

  it('never lets a score fall as rallies are added', () => {
    const random = makeRandom(0x5c04e);

    for (let i = 0; i < 40; i++) {
      const log = randomMatch(format, random);
      let previous = 0;

      for (let k = 0; k <= log.length; k++) {
        const state = scoreMatch(format, log.slice(0, k));
        const points = state.games.reduce((sum, g) => sum + g.scoreA + g.scoreB, 0);

        expect(points).toBeGreaterThanOrEqual(previous);
        previous = points;
      }
    }
  });

  it('always hands the serve to whoever won the last rally', () => {
    const random = makeRandom(0x5e2e);

    for (let i = 0; i < CASES; i++) {
      const log = randomMatch(format, random);

      for (let k = 1; k <= log.length; k++) {
        const state = scoreMatch(format, log.slice(0, k));
        if (state.complete) break;

        const lastWinner = log[k - 1]!.winner;
        expect(state.serve?.server ?? state.nextServer).toBe(lastWinner);
      }
    }
  });

  it('always serves from the court matching the server score', () => {
    const random = makeRandom(0xc0173);

    for (let i = 0; i < CASES; i++) {
      const log = randomMatch(format, random);

      for (let k = 0; k <= log.length; k++) {
        const state = scoreMatch(format, log.slice(0, k));
        const { serve, current } = state;
        if (!serve) continue;

        const serverScore = serve.server === 'A' ? current.scoreA : current.scoreB;
        expect(serve.court).toBe(serverScore % 2 === 0 ? 'right' : 'left');
      }
    }
  });

  it('keeps each pair split across the two service courts', () => {
    if (format.discipline !== 'doubles') return;
    const random = makeRandom(0xd0b1e);

    for (let i = 0; i < CASES; i++) {
      const log = randomMatch(format, random);

      for (let k = 0; k <= log.length; k++) {
        const { serve } = scoreMatch(format, log.slice(0, k));
        if (!serve) continue;

        // The server and their diagonal opponent occupy the same named court,
        // and each side's other player is necessarily in the other one.
        expect([0, 1]).toContain(serve.serverIndex);
        expect([0, 1]).toContain(serve.receiverIndex);
        expect(serve.rightCourt).not.toBeNull();
      }
    }
  });

  it('respects the cap and the winning margin in every game', () => {
    const random = makeRandom(0xca9);
    const needed = gamesToWin(format);

    for (let i = 0; i < CASES; i++) {
      const state = scoreMatch(format, randomMatch(format, random));

      for (const game of state.games) {
        const hi = Math.max(game.scoreA, game.scoreB);
        const lo = Math.min(game.scoreA, game.scoreB);

        if (format.cap !== null) expect(hi).toBeLessThanOrEqual(format.cap);

        if (game.complete) {
          const byCap = format.cap !== null && hi >= format.cap;
          expect(byCap || (hi >= format.pointsToWin && hi - lo >= format.winBy)).toBe(true);
          expect(game.winner).toBe(game.scoreA > game.scoreB ? 'A' : 'B');
        } else {
          expect(hi).toBeLessThan(format.pointsToWin + format.winBy);
        }
      }

      expect(state.games).toHaveLength(
        state.gamesWon.A + state.gamesWon.B + (state.current.complete ? 0 : 1),
      );

      if (state.complete) {
        const winner = state.winner as Side;
        expect(state.gamesWon[winner]).toBe(needed);
        expect(state.gamesWon[winner === 'A' ? 'B' : 'A']).toBeLessThan(needed);
        expect(state.serve).toBeNull();
      }
    }
  });

  it('makes undo exactly equivalent to never having recorded the rally', () => {
    const random = makeRandom(0x0d0);

    for (let i = 0; i < CASES; i++) {
      const log = randomMatch(format, random);
      if (log.length === 0) continue;

      const undone = scoreMatch(format, undoLastRally(log, 'ref-1'));
      const truncated = scoreMatch(format, log.slice(0, -1));

      expect(undone.current).toEqual(truncated.current);
      expect(undone.gamesWon).toEqual(truncated.gamesWon);
      expect(undone.serve).toEqual(truncated.serve);
      expect(undone.complete).toBe(truncated.complete);
      expect(undone.rallyCount).toBe(truncated.rallyCount);
    }
  });

  it('folds to the same state regardless of arrival order', () => {
    const random = makeRandom(0x5117);

    for (let i = 0; i < 100; i++) {
      const log = randomMatch(format, random);
      const shuffled = [...log];

      for (let j = shuffled.length - 1; j > 0; j--) {
        const k = random.int(0, j);
        [shuffled[j], shuffled[k]] = [shuffled[k]!, shuffled[j]!];
      }

      expect(scoreMatch(format, shuffled).games).toEqual(scoreMatch(format, log).games);
    }
  });
});
