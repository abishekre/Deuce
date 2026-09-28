import { describe, expect, it } from 'vitest';

import { appendRally, BWF_21, SHORT_11, undoLastRally } from '../rules';

import { createMatch, DEFAULT_INPUT, isDoubleTap, lastLiveRally, lineupFrom, scoreLocal, type MatchInput } from './match';

const input = (patch: Partial<MatchInput>): MatchInput => ({ ...DEFAULT_INPUT, ...patch });

describe('lineupFrom', () => {
  it('numbers blank singles players so a match can start with no typing', () => {
    expect(lineupFrom(input({ discipline: 'singles' }))).toEqual({ A: ['Player 1'], B: ['Player 2'] });
  });

  it('numbers blank doubles players across both sides', () => {
    expect(lineupFrom(input({ discipline: 'doubles' }))).toEqual({
      A: ['Player 1', 'Player 2'],
      B: ['Player 3', 'Player 4'],
    });
  });

  it('trims typed names and fills only the gaps', () => {
    const lineup = lineupFrom(input({ discipline: 'doubles', names: { A: [' Arun ', ''], B: ['Kiran', 'Dev'] } }));
    expect(lineup).toEqual({ A: ['Arun', 'Player 2'], B: ['Kiran', 'Dev'] });
  });

  it('drops the second name in singles', () => {
    const lineup = lineupFrom(input({ discipline: 'singles', names: { A: ['Arun', 'Priya'], B: ['Kiran', 'Dev'] } }));
    expect(lineup).toEqual({ A: ['Arun'], B: ['Kiran'] });
  });
});

describe('createMatch', () => {
  it('builds the format from the preset and discipline, with an empty log', () => {
    const match = createMatch(input({ discipline: 'singles', preset: 'short11' }), 'm1', 1000);

    expect(match.format).toEqual(SHORT_11('singles'));
    expect(match).toMatchObject({ id: 'm1', startedAt: 1000, rallies: [], startingLeft: 'A' });
  });
});

describe('scoreLocal', () => {
  it('hands the first serve to the side that won the toss', () => {
    const match = createMatch(input({ firstServer: 'B' }), 'm1', 0);
    expect(scoreLocal(match).serve?.server).toBe('B');
  });

  it('folds the stored log with the stored format', () => {
    const match = { ...createMatch(input({}), 'm1', 0), rallies: appendRally([], 'r0', 'A') };

    expect(match.format).toEqual(BWF_21('doubles'));
    expect(scoreLocal(match).current).toMatchObject({ scoreA: 1, scoreB: 0 });
  });
});

describe('lastLiveRally', () => {
  it('skips voided rallies to find the one an undo would take back', () => {
    const log = undoLastRally(appendRally(appendRally([], 'r0', 'A'), 'r1', 'B'), 'u1');
    expect(lastLiveRally(log)?.id).toBe('r0');
  });

  it('is null when there is nothing left to undo', () => {
    expect(lastLiveRally([])).toBeNull();
    expect(lastLiveRally(undoLastRally(appendRally([], 'r0', 'A'), 'u1'))).toBeNull();
  });
});

describe('isDoubleTap', () => {
  it('only rejects a second tap inside the window', () => {
    expect(isDoubleTap(null, 0)).toBe(false);
    expect(isDoubleTap(1000, 1399)).toBe(true);
    expect(isDoubleTap(1000, 1400)).toBe(false);
  });
});
