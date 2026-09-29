import { describe, expect, it } from 'vitest';

import { appendRally, undoLastRally } from '../rules';
import { ralliesFrom, sweep } from '../rules/testing';
import { createMatch, DEFAULT_INPUT, scoreFrom, scoreLocal } from '../scorer/match';

import {
  acknowledge,
  describeSync,
  matchPayload,
  parseLiveMatch,
  pendingRallies,
  rallyPayload,
  SLUG_PATTERN,
} from './protocol';

const ID = { id: 'm1', slug: 'K7QX2P9MAB', refereeToken: 'SECRET'.repeat(6) };
const match = (rallies = ralliesFrom('AAB')) => ({ ...createMatch(DEFAULT_INPUT, ID, 1_700_000_000_000), rallies });

describe('pendingRallies', () => {
  it('sends everything the server has never seen, in rally order', () => {
    const log = ralliesFrom('AAB');
    const shuffled = [log[2]!, log[0]!, log[1]!];

    expect(pendingRallies(shuffled, new Map()).map((r) => r.id)).toEqual(['r0', 'r1', 'r2']);
  });

  it('sends nothing once the server holds every rally in its current state', () => {
    const log = ralliesFrom('AAB');
    expect(pendingRallies(log, acknowledge(new Map(), log))).toEqual([]);
  });

  it('resends a rally that has been voided since it was acknowledged', () => {
    const log = ralliesFrom('AAB');
    const acked = acknowledge(new Map(), log);
    const undone = undoLastRally(log, 'undo-1');

    expect(pendingRallies(undone, acked)).toEqual([{ id: 'r2', seq: 2, winner: 'B', voidedBy: 'undo-1' }]);
  });

  it('sends a rally voided before it ever reached the server exactly once, as voided', () => {
    const log = undoLastRally(appendRally([], 'r0', 'A'), 'undo-1');
    const pending = pendingRallies(log, new Map());

    expect(pending).toEqual([{ id: 'r0', seq: 0, winner: 'A', voidedBy: 'undo-1' }]);
    expect(pendingRallies(log, acknowledge(new Map(), pending))).toEqual([]);
  });
});

describe('payloads', () => {
  it('never carries the referee token inside the match', () => {
    const payload = matchPayload(match());

    expect(JSON.stringify(payload)).not.toContain(ID.refereeToken);
    expect(Object.keys(payload).sort()).toEqual(['firstServer', 'format', 'id', 'lineup', 'slug', 'startedAt']);
  });

  it('sends an explicit null for a live rally', () => {
    expect(rallyPayload({ id: 'r0', seq: 0, winner: 'A' })).toEqual({ id: 'r0', seq: 0, winner: 'A', voidedBy: null });
  });
});

describe('parseLiveMatch', () => {
  /** What live_match returns for a match this device pushed. */
  const served = (m = match()) => {
    const { id: _id, ...visible } = matchPayload(m);
    return { ...visible, rallies: m.rallies.map(rallyPayload) };
  };

  it('round-trips to the same score the referee sees', () => {
    const local = match(ralliesFrom(sweep('A', 21) + 'BAB'));
    const live = parseLiveMatch(JSON.parse(JSON.stringify(served(local))));

    expect(live).not.toBeNull();
    expect(scoreFrom(live!.format, live!.rallies, live!.firstServer)).toEqual(scoreLocal(local));
  });

  it('rejects payloads that would break the fold or the page', () => {
    const good = served();
    const broken: unknown[] = [
      null,
      'match',
      { ...good, firstServer: 'C' },
      { ...good, lineup: { A: [], B: ['Kiran'] } },
      { ...good, lineup: { A: ['x'.repeat(61)], B: ['Kiran'] } },
      { ...good, format: { ...good.format, bestOf: '3' } },
      { ...good, rallies: [{ id: 'r0', seq: 0.5, winner: 'A' }] },
      { ...good, rallies: [{ id: 'r0', seq: 0, winner: 'X' }] },
    ];

    for (const value of broken) expect(parseLiveMatch(value)).toBeNull();
  });
});

describe('SLUG_PATTERN', () => {
  it('accepts the unambiguous alphabet only', () => {
    expect(SLUG_PATTERN.test('K7QX2P9MAB')).toBe(true);
    expect(SLUG_PATTERN.test('K7QX2P9MA0')).toBe(false);
    expect(SLUG_PATTERN.test('K7QX2P9MAI')).toBe(false);
    expect(SLUG_PATTERN.test('K7QX2P9MA')).toBe(false);
  });
});

describe('describeSync', () => {
  it('stays quiet through the normal in-flight blip', () => {
    expect(describeSync({ kind: 'live', pending: 0 })).toEqual({ tone: 'good', text: 'Live' });
    expect(describeSync({ kind: 'live', pending: 1 })).toEqual({ tone: 'good', text: 'Live' });
    expect(describeSync({ kind: 'live', pending: 9 })).toEqual({ tone: 'good', text: 'Sending 9' });
  });

  it('says exactly what is stuck when the signal goes', () => {
    expect(describeSync({ kind: 'waiting', pending: 4, created: true })).toEqual({ tone: 'warn', text: '4 unsent' });
    expect(describeSync({ kind: 'waiting', pending: 0, created: false })).toEqual({ tone: 'warn', text: 'Not live yet' });
    expect(describeSync({ kind: 'rejected' })).toEqual({ tone: 'bad', text: 'Not live' });
  });

  it('shows nothing when the build has no backend', () => {
    expect(describeSync({ kind: 'local' })).toBeNull();
  });
});
