import { describe, expect, it } from 'vitest';

import { BWF_21, scoreMatch, SHORT_11, SHORT_15, SINGLE_21 } from '../rules';
import { ralliesFrom, sweep } from '../rules/testing';

import {
  callFor,
  describeFormat,
  earlierScores,
  pointCall,
  roleOf,
  sideLabel,
  sideOnLeft,
} from './present';

const pairs = { A: ['Arun', 'Priya'], B: ['Kiran', 'Dev'] } as const;
const solo = { A: ['Arun'], B: ['Kiran'] } as const;

const doubles = (log: string) => scoreMatch(BWF_21('doubles'), ralliesFrom(log));
const singles = (log: string) => scoreMatch(BWF_21('singles'), ralliesFrom(log));

describe('labels', () => {
  it('joins a pair and leaves a single player alone', () => {
    expect(sideLabel(pairs, 'A')).toBe('Arun & Priya');
    expect(sideLabel(solo, 'B')).toBe('Kiran');
  });

  it('describes every preset the way an organiser would say it', () => {
    expect(describeFormat(BWF_21('doubles'))).toBe('Best of 3 to 21');
    expect(describeFormat(SINGLE_21('doubles'))).toBe('One game to 21');
    expect(describeFormat(SHORT_15('doubles'))).toBe('Best of 3 to 15');
    expect(describeFormat(SHORT_11('doubles'))).toBe('Best of 5 to 11');
  });
});

describe('sideOnLeft', () => {
  it('swaps the halves of the screen when the players change ends', () => {
    expect(sideOnLeft(doubles(''), 'A')).toBe('A');
    expect(sideOnLeft(doubles(sweep('A', 21)), 'A')).toBe('B');
    expect(sideOnLeft(doubles(sweep('A', 21) + sweep('B', 21)), 'A')).toBe('A');
  });

  it('starts from however the referee is holding the phone', () => {
    expect(sideOnLeft(doubles(''), 'B')).toBe('B');
    expect(sideOnLeft(doubles(sweep('A', 21)), 'B')).toBe('A');
  });
});

describe('earlierScores', () => {
  it('lists finished games that are no longer on the big numbers', () => {
    const state = doubles(sweep('A', 21) + 'B');

    expect(earlierScores(state, 'A')).toEqual([21]);
    expect(earlierScores(state, 'B')).toEqual([0]);
  });

  it('keeps a just-finished game on the big numbers during the break', () => {
    expect(earlierScores(doubles(sweep('A', 21)), 'A')).toEqual([]);
  });
});

describe('roleOf', () => {
  it('marks exactly one server and one receiver in doubles', () => {
    const start = doubles('');
    expect([roleOf(start, 'A', 0), roleOf(start, 'A', 1)]).toEqual(['serve', null]);
    expect([roleOf(start, 'B', 0), roleOf(start, 'B', 1)]).toEqual(['receive', null]);

    const handedOver = doubles('AAB');
    expect([roleOf(handedOver, 'B', 0), roleOf(handedOver, 'B', 1)]).toEqual([null, 'serve']);
    expect([roleOf(handedOver, 'A', 0), roleOf(handedOver, 'A', 1)]).toEqual([null, 'receive']);
  });

  it('marks nobody between games', () => {
    expect(roleOf(doubles(sweep('A', 21)), 'A', 0)).toBeNull();
  });
});

describe('pointCall', () => {
  it('distinguishes game point from match point', () => {
    expect(pointCall(doubles(sweep('A', 20)), 'A')).toBe('game');
    expect(pointCall(doubles(sweep('A', 20)), 'B')).toBeNull();
    expect(pointCall(doubles(sweep('A', 21) + sweep('A', 20)), 'A')).toBe('match');
  });
});

describe('callFor', () => {
  it('names the server, their court and the receiver', () => {
    expect(callFor(doubles(''), pairs)).toEqual({
      headline: null,
      serve: 'Arun serves from the right court to Kiran',
      tone: 'play',
    });

    // B takes the serve without swapping, so whoever is in the left court serves.
    expect(callFor(doubles('AAB'), pairs).serve).toBe('Dev serves from the left court to Priya');
  });

  it('calls the interval, and the change of ends in the decider', () => {
    expect(callFor(singles(sweep('A', 11)), solo)).toEqual({
      headline: 'Interval.',
      serve: 'Arun serves from the left court to Kiran',
      tone: 'pause',
    });

    const decider = singles(sweep('A', 21) + sweep('B', 21) + sweep('A', 11));
    expect(callFor(decider, solo).headline).toBe('Interval. Change ends.');
  });

  it('announces the game and who serves next during the break', () => {
    expect(callFor(doubles(sweep('A', 21)), pairs)).toEqual({
      headline: 'Game 1 to Arun & Priya, 21–0. Change ends.',
      serve: 'Arun & Priya to serve first.',
      tone: 'pause',
    });
  });

  it('reads the result from the winner side, with the right verb', () => {
    expect(callFor(doubles(sweep('A', 42)), pairs).headline).toBe('Arun & Priya win 21–0, 21–0');

    const threeGames = singles(sweep('A', 21) + sweep('B', 21) + sweep('A', 21));
    expect(callFor(threeGames, solo)).toEqual({
      headline: 'Arun wins 21–0, 0–21, 21–0',
      serve: null,
      tone: 'over',
    });
  });
});
