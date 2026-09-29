import { describe, expect, it } from 'vitest';

import { BWF_21, scoreMatch } from '../rules';
import { ralliesFrom, sweep } from '../rules/testing';

import { groupResultFrom } from './fromMatch';
import { groupStandings } from './standings';

const doubles = BWF_21('doubles');

describe('groupResultFrom', () => {
  it('turns a finished match into a result the standings can rank', () => {
    const state = scoreMatch(doubles, ralliesFrom(sweep('B', 21) + sweep('A', 21) + sweep('A', 21)));

    expect(groupResultFrom('pairX', 'pairY', state)).toEqual({
      a: 'pairX',
      b: 'pairY',
      winner: 'pairX',
      outcome: 'normal',
      games: [
        { a: 0, b: 21 },
        { a: 21, b: 0 },
        { a: 21, b: 0 },
      ],
    });
  });

  it('counts nothing from a match still in play', () => {
    expect(groupResultFrom('pairX', 'pairY', scoreMatch(doubles, ralliesFrom(sweep('A', 30))))).toBeNull();
  });

  it('feeds the standings end to end, from rallies to a ranked table', () => {
    const play = (log: string) => scoreMatch(doubles, ralliesFrom(log));
    const results = [
      groupResultFrom('X', 'Y', play(sweep('A', 42))),
      groupResultFrom('Y', 'Z', play(sweep('A', 42))),
      groupResultFrom('X', 'Z', play(sweep('B', 21) + sweep('A', 42))),
    ].filter((r) => r !== null);

    expect(groupStandings(['X', 'Y', 'Z'], results).map((s) => [s.entry, s.won, s.gamesWon, s.gamesLost])).toEqual([
      ['X', 2, 4, 1],
      ['Y', 1, 2, 2],
      ['Z', 0, 1, 4],
    ]);
  });
});
