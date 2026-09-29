import { describe, expect, it } from 'vitest';

import { liveLink } from './links';

describe('liveLink', () => {
  const origin = 'http://192.168.1.20:8091';

  it('falls back to the page origin when the site URL is blank, as .env.example ships it', () => {
    expect(liveLink('PR3HQCTQLY', '', origin)).toBe('http://192.168.1.20:8091/m/PR3HQCTQLY');
    expect(liveLink('PR3HQCTQLY', '   ', origin)).toBe('http://192.168.1.20:8091/m/PR3HQCTQLY');
    expect(liveLink('PR3HQCTQLY', undefined, origin)).toBe('http://192.168.1.20:8091/m/PR3HQCTQLY');
  });

  it('prefers a configured site URL, without doubling the slash', () => {
    expect(liveLink('PR3HQCTQLY', 'https://deuce.example.com/', origin)).toBe(
      'https://deuce.example.com/m/PR3HQCTQLY',
    );
  });

  it('has no link on a native build with no site URL', () => {
    expect(liveLink('PR3HQCTQLY', '', null)).toBeNull();
  });
});
