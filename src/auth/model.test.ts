import { describe, expect, it } from 'vitest';

import { formatPhone, normalizePhone, parseMyProfile, parseOutcome, refusalMessage, safeNext } from './model';

describe('safeNext', () => {
  it('returns to a page inside Deuce', () => {
    expect(safeNext('/score')).toBe('/score');
    expect(safeNext('/m/K7QX2P9MAB')).toBe('/m/K7QX2P9MAB');
  });

  it('never leaves Deuce, whatever the link says', () => {
    for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '', undefined, 42]) {
      expect(safeNext(value), String(value)).toBe('/');
    }
  });

  it('never lands back on a sign-in page', () => {
    expect(safeNext('/sign-in?next=/score')).toBe('/');
    expect(safeNext('/auth/callback')).toBe('/');
  });
});

describe('normalizePhone', () => {
  it('reads an Indian mobile however it is written', () => {
    for (const input of [
      '9876543210',
      '98765 43210',
      '98765-43210',
      '09876543210',
      '919876543210',
      '+919876543210',
      '+91 98765 43210',
      '0091 98765 43210',
      ' (+91) 98765-43210 ',
    ]) {
      expect(normalizePhone(input), input).toBe('+919876543210');
    }
  });

  it('refuses what is not an Indian mobile', () => {
    for (const input of ['', '98765', '5876543210', '+91 44 2345 6789', '98765432101', 'call me']) {
      expect(normalizePhone(input), input).toBeNull();
    }
  });

  it('accepts other countries only with their + and country code', () => {
    expect(normalizePhone('+44 7700 900123')).toBe('+447700900123');
    expect(normalizePhone('+1 (415) 555-0123')).toBe('+14155550123');
    expect(normalizePhone('+0123456789')).toBeNull();
  });
});

describe('formatPhone', () => {
  it('groups an Indian mobile the way it is read aloud', () => {
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
    expect(formatPhone('+447700900123')).toBe('+447700900123');
  });
});

describe('parseMyProfile', () => {
  it('accepts what my_profile returns', () => {
    expect(
      parseMyProfile({ id: 'p1', displayName: 'Asha', club: null, city: 'Chennai', phone: '+919876543210', claimedVia: 'self' }),
    ).toEqual({ id: 'p1', displayName: 'Asha', club: null, city: 'Chennai', phone: '+919876543210', claimedVia: 'self' });
  });

  it('treats no profile and anything malformed as no profile', () => {
    expect(parseMyProfile(null)).toBeNull();
    expect(parseMyProfile({ id: 'p1' })).toBeNull();
    expect(parseMyProfile({ id: 'p1', displayName: 'Asha', claimedVia: 'stolen' })).toBeNull();
  });
});

describe('parseOutcome', () => {
  it('passes known refusals through and hides anything else', () => {
    expect(parseOutcome({ ok: true, id: 'p1' })).toEqual({ ok: true });
    expect(parseOutcome({ ok: false, reason: 'phone_unclaimed' })).toEqual({ ok: false, reason: 'phone_unclaimed' });
    expect(parseOutcome({ ok: false, reason: 'drop table' })).toEqual({ ok: false, reason: 'unknown' });
    expect(parseOutcome(null)).toEqual({ ok: false, reason: 'unknown' });
  });

  it('has words for every refusal', () => {
    for (const reason of [
      'rate_limited',
      'has_profile',
      'no_profile',
      'name_invalid',
      'details_invalid',
      'phone_invalid',
      'phone_unclaimed',
      'phone_taken',
      'unknown',
    ] as const) {
      expect(refusalMessage(reason).length).toBeGreaterThan(10);
    }
  });
});
