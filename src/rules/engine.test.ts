import { describe, expect, it } from 'vitest';

import { appendRally, RulesError, scoreMatch, undoLastRally, validateFormat } from './engine';
import { BWF_21, SHORT_11, SINGLE_21 } from './formats';
import { ralliesFrom, sweep } from './testing';
import type { MatchFormat } from './types';

const singles = BWF_21('singles');
const doubles = BWF_21('doubles');

describe('a match that has not started', () => {
  it('has one game at love-all with the toss winner to serve', () => {
    const state = scoreMatch(singles, [], { firstServer: 'B' });

    expect(state.games).toHaveLength(1);
    expect(state.current).toMatchObject({ index: 0, scoreA: 0, scoreB: 0, complete: false });
    expect(state.complete).toBe(false);
    expect(state.rallyCount).toBe(0);
    expect(state.serve).toMatchObject({ server: 'B', receiver: 'A', court: 'right' });
  });
});

describe('game completion', () => {
  it('ends a game at 21 with a two point margin', () => {
    const state = scoreMatch(singles, ralliesFrom(sweep('A', 21)));

    expect(state.current).toMatchObject({ scoreA: 21, scoreB: 0, complete: true, winner: 'A' });
    expect(state.gamesWon).toEqual({ A: 1, B: 0 });
    expect(state.complete).toBe(false);
  });

  it('plays on at 21-20 and settles at 24-22', () => {
    const toTwenty = scoreMatch(singles, ralliesFrom('AB'.repeat(20)));
    expect(toTwenty.current).toMatchObject({ scoreA: 20, scoreB: 20, complete: false });

    const deuce = scoreMatch(singles, ralliesFrom('AB'.repeat(20) + 'ABABAA'));
    expect(deuce.current).toMatchObject({ scoreA: 24, scoreB: 22, complete: true, winner: 'A' });
  });

  it('awards the game to whoever reaches the cap, margin or not', () => {
    const level = scoreMatch(singles, ralliesFrom('AB'.repeat(29)));
    expect(level.current).toMatchObject({ scoreA: 29, scoreB: 29, complete: false });

    const suddenDeath = scoreMatch(singles, ralliesFrom('AB'.repeat(29) + 'A'));
    expect(suddenDeath.current).toMatchObject({ scoreA: 30, scoreB: 29, complete: true, winner: 'A' });
  });

  it('honours a single-game format', () => {
    const state = scoreMatch(SINGLE_21('singles'), ralliesFrom(sweep('A', 21)));

    expect(state.complete).toBe(true);
    expect(state.winner).toBe('A');
  });
});

describe('match completion', () => {
  it('takes the match on the second game of a best of three', () => {
    const state = scoreMatch(singles, ralliesFrom(sweep('A', 21) + sweep('A', 21)));

    expect(state.games).toHaveLength(2);
    expect(state.gamesWon).toEqual({ A: 2, B: 0 });
    expect(state.complete).toBe(true);
    expect(state.winner).toBe('A');
    expect(state.serve).toBeNull();
  });

  it('needs three games in a best of five', () => {
    const log = sweep('A', 11) + sweep('A', 11) + sweep('A', 11);
    const state = scoreMatch(SHORT_11('doubles'), ralliesFrom(log));

    expect(state.complete).toBe(true);
    expect(state.gamesWon).toEqual({ A: 3, B: 0 });
  });

  it('refuses to apply rallies recorded after match point, and reports them', () => {
    const state = scoreMatch(singles, ralliesFrom(sweep('A', 21) + sweep('A', 21) + 'BBB'));

    expect(state.winner).toBe('A');
    expect(state.rallyCount).toBe(42);
    expect(state.surplusRallyIds).toEqual(['r42', 'r43', 'r44']);
  });
});

describe('between games', () => {
  it('parks the serve and names the next server while ends are changed', () => {
    const state = scoreMatch(singles, ralliesFrom(sweep('A', 21)));

    expect(state.serve).toBeNull();
    expect(state.nextServer).toBe('A');
    expect(state.changeEnds).toBe(true);
  });

  it('gives the next game to the previous winner and resets the score', () => {
    const state = scoreMatch(singles, ralliesFrom(sweep('A', 21) + 'B'));

    expect(state.games).toHaveLength(2);
    expect(state.current).toMatchObject({ index: 1, scoreA: 0, scoreB: 1 });
    // A won game one so A served first; B took the serve by winning the rally.
    expect(state.serve).toMatchObject({ server: 'B' });
  });
});

describe('intervals and ends', () => {
  it('flags the mid-game interval when the leading score reaches eleven', () => {
    const state = scoreMatch(singles, ralliesFrom(sweep('A', 11)));

    expect(state.atInterval).toBe(true);
    expect(state.changeEnds).toBe(false);
  });

  it('changes ends at the interval of the deciding game', () => {
    const log = sweep('A', 21) + sweep('B', 21) + sweep('A', 11);
    const state = scoreMatch(singles, ralliesFrom(log));

    expect(state.current.index).toBe(2);
    expect(state.atInterval).toBe(true);
    expect(state.changeEnds).toBe(true);
  });

  it('does not re-trigger the interval once passed', () => {
    const state = scoreMatch(singles, ralliesFrom(sweep('A', 12)));

    expect(state.atInterval).toBe(false);
  });
});

describe('singles service court', () => {
  it('follows the server own score parity', () => {
    const atLove = scoreMatch(singles, []);
    expect(atLove.serve).toMatchObject({ server: 'A', court: 'right' });

    const atOne = scoreMatch(singles, ralliesFrom('A'));
    expect(atOne.serve).toMatchObject({ server: 'A', court: 'left' });

    const handover = scoreMatch(singles, ralliesFrom('AB'));
    expect(handover.serve).toMatchObject({ server: 'B', court: 'left' });
  });
});

describe('doubles service rotation', () => {
  const setup = { firstServer: 'A' as const, startingRight: { A: 0 as const, B: 0 as const } };
  const at = (log: string) => scoreMatch(doubles, ralliesFrom(log), setup).serve;

  it('keeps the same server on strike after winning on serve, from the other court', () => {
    expect(at('')).toMatchObject({ server: 'A', court: 'right', serverIndex: 0, receiverIndex: 0 });

    // A wins on serve: same player serves, the pair have swapped courts.
    expect(at('A')).toMatchObject({ server: 'A', court: 'left', serverIndex: 0, receiverIndex: 1 });
    expect(at('AA')).toMatchObject({ server: 'A', court: 'right', serverIndex: 0, receiverIndex: 0 });
  });

  it('hands the serve over without the receiving pair swapping courts', () => {
    // B wins the serve at 2-1. B did not swap, so whoever stands in the left
    // court serves — B1, not the player who happened to be receiving.
    expect(at('AAB')).toMatchObject({ server: 'B', court: 'left', serverIndex: 1, receiverIndex: 1 });

    // Now B wins on serve, so B swaps and B1 serves again from the right.
    expect(at('AABB')).toMatchObject({ server: 'B', court: 'right', serverIndex: 1, receiverIndex: 0 });
  });

  it('tracks both pairs independently', () => {
    expect(at('AABBA')).toMatchObject({ server: 'A', court: 'left', serverIndex: 1, receiverIndex: 0 });
  });

  it('reports no player positions in singles', () => {
    expect(scoreMatch(singles, ralliesFrom('AAB')).serve).toMatchObject({
      serverIndex: null,
      receiverIndex: null,
      rightCourt: null,
    });
  });
});

describe('undo', () => {
  it('tombstones the last live rally instead of deleting it', () => {
    const log = ralliesFrom('AAB');
    const undone = undoLastRally(log, 'ref-1');

    expect(undone).toHaveLength(3);
    expect(undone[2]).toMatchObject({ id: 'r2', voidedBy: 'ref-1' });
    expect(scoreMatch(singles, undone).current).toMatchObject({ scoreA: 2, scoreB: 0 });
  });

  it('skips over an already voided rally', () => {
    const once = undoLastRally(ralliesFrom('AAB'), 'ref-1');
    const twice = undoLastRally(once, 'ref-2');

    expect(twice[1]).toMatchObject({ id: 'r1', voidedBy: 'ref-2' });
    expect(scoreMatch(singles, twice).current).toMatchObject({ scoreA: 1, scoreB: 0 });
  });

  it('is a no-op on an empty log', () => {
    expect(undoLastRally([], 'ref-1')).toEqual([]);
  });
});

describe('the rally log', () => {
  it('ignores voided rallies wherever they sit in the order', () => {
    const log = ralliesFrom('ABABA').map((r) => (r.seq === 1 ? { ...r, voidedBy: 'ref-1' } : r));
    const state = scoreMatch(singles, log);

    expect(state.current).toMatchObject({ scoreA: 3, scoreB: 1 });
    expect(state.rallyCount).toBe(4);
  });

  it('folds out-of-order arrivals by seq, not array position', () => {
    const ordered = ralliesFrom('AAB');
    const shuffled = [ordered[2]!, ordered[0]!, ordered[1]!];

    expect(scoreMatch(singles, shuffled).current).toEqual(scoreMatch(singles, ordered).current);
  });

  it('numbers appended rallies monotonically', () => {
    const log = appendRally(appendRally([], 'x', 'A'), 'y', 'B');
    expect(log.map((r) => r.seq)).toEqual([0, 1]);
  });
});

describe('format validation', () => {
  const invalid: ReadonlyArray<[string, Partial<MatchFormat>, RegExp]> = [
    ['a cap below the target score', { cap: 15 }, /cap must be null/],
    ['an even number of games', { bestOf: 2 }, /positive odd integer/],
    ['a zero target', { pointsToWin: 0 }, /pointsToWin must be/],
    ['a fractional margin', { winBy: 1.5 }, /winBy must be/],
    ['an interval past the target', { intervalAt: 25 }, /intervalAt must be null/],
  ];

  it.each(invalid)('rejects %s', (_label, patch, message) => {
    expect(() => validateFormat({ ...singles, ...patch })).toThrow(message);
    expect(() => validateFormat({ ...singles, ...patch })).toThrow(RulesError);
  });

  it('accepts an uncapped format', () => {
    expect(() => validateFormat({ ...singles, cap: null })).not.toThrow();
  });
});
