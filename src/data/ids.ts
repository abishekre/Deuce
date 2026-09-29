import * as Crypto from 'expo-crypto';

/**
 * UUIDv7 — time-ordered, generated on the client.
 *
 * Client-generated ids are what will make the offline outbox safe: a queued
 * rally already knows its own id, so replaying it after an uncertain network
 * failure upserts the same row instead of scoring the point twice.
 *
 * v7 rather than v4 because the first 48 bits are a millisecond timestamp, so
 * rows arrive in insertion order and index writes stay at the right edge.
 */
export function uuidv7(): string {
  const bytes = Crypto.getRandomBytes(16);
  const timestamp = Date.now();

  // 48-bit big-endian timestamp.
  bytes[0] = (timestamp / 2 ** 40) & 0xff;
  bytes[1] = (timestamp / 2 ** 32) & 0xff;
  bytes[2] = (timestamp / 2 ** 24) & 0xff;
  bytes[3] = (timestamp / 2 ** 16) & 0xff;
  bytes[4] = (timestamp / 2 ** 8) & 0xff;
  bytes[5] = timestamp & 0xff;

  // Version 7, RFC 4122 variant.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push((bytes[i] ?? 0).toString(16).padStart(2, '0'));

  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

/**
 * No I, O, 0 or 1, so a code read aloud across a sports hall or typed from a
 * screenshot is unambiguous. 32 symbols divide 256 evenly, so taking a random
 * byte modulo the length introduces no bias.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(length: number): string {
  const bytes = Crypto.getRandomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length];
  return out;
}

/** The public handle in a spectator link. 50 bits: short enough to share, too many to enumerate. */
export const matchSlug = (): string => randomCode(10);

/**
 * The secret that makes this device the referee. 160 bits from the platform
 * CSPRNG — it is the only thing standing between a spectator and the score,
 * so it has to be unguessable, not merely unique.
 */
export const refereeToken = (): string => randomCode(32);
