#!/usr/bin/env node
/**
 * Live attack suite for the scoring API.
 *
 * Runs against a real Supabase project with the public key — exactly the
 * access a stranger holding a spectator link has. Every check below is an
 * attempt to do something the database must refuse: write without the token,
 * take over a match, rewrite history, void another match's points, or read
 * the tables directly. The server's own validation is what is under test, so
 * nothing here goes through the app's code.
 *
 *   npm run db:smoke
 *
 * Leaves its matches behind (the public key cannot delete). They are all named
 * "Smoke …", so they are easy to find and remove.
 */
import { randomBytes, randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env first.');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = (length) => [...randomBytes(length)].map((b) => ALPHABET[b % 32]).join('');

const FORMAT = { discipline: 'doubles', pointsToWin: 21, winBy: 2, cap: 30, bestOf: 3, intervalAt: 11 };

function newMatch(label) {
  return {
    match: {
      id: randomUUID(),
      slug: code(10),
      format: FORMAT,
      lineup: { A: [`Smoke ${label} A1`, `Smoke ${label} A2`], B: [`Smoke ${label} B1`, `Smoke ${label} B2`] },
      firstServer: 'A',
      startedAt: Date.now(),
    },
    token: code(32),
  };
}

const rally = (seq, winner, extra = {}) => ({ id: randomUUID(), seq, winner, voidedBy: null, ...extra });

const sync = (m, token, rallies) =>
  db.rpc('sync_match', { p_match: m.match, p_token: token, p_rallies: rallies });

const live = async (slug) => {
  const { data, error } = await db.rpc('live_match', { p_slug: slug });
  if (error) throw error;
  return data;
};

let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  ✗ ${name}\n      ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function refused({ error }, code) {
  assert(error, `expected a refusal (${code}), but the call succeeded`);
  assert(error.code === code, `expected error ${code}, got ${error.code}: ${error.message}`);
}

// ---------------------------------------------------------------------------

const x = newMatch('X');
const opening = [rally(0, 'A'), rally(1, 'A'), rally(2, 'B')];

console.log('\nReferee');

await check('creates a match and records rallies in one call', async () => {
  const { data, error } = await sync(x, x.token, opening);
  assert(!error, error?.message);
  assert(data === 3, `server holds ${data} rallies, expected 3`);
});

await check('replaying the same batch changes nothing', async () => {
  const { data, error } = await sync(x, x.token, opening);
  assert(!error, error?.message);
  assert(data === 3, `server holds ${data} rallies after replay, expected 3`);
});

await check('can tombstone its own rally', async () => {
  const { error } = await sync(x, x.token, [{ ...opening[2], voidedBy: 'undo-1' }]);
  assert(!error, error?.message);
  const found = (await live(x.match.slug)).rallies.find((r) => r.id === opening[2].id);
  assert(found.voidedBy === 'undo-1', `rally not voided: ${JSON.stringify(found)}`);
});

console.log('\nSpectator');

await check('reads the match by slug, in any case', async () => {
  const lower = await live(x.match.slug.toLowerCase());
  assert(lower?.rallies.length === 3, `expected 3 rallies, got ${lower?.rallies.length}`);
});

await check('never sees the internal id or anything secret', async () => {
  const text = JSON.stringify(await live(x.match.slug));
  assert(!text.includes(x.match.id), 'live_match leaked the internal match id');
  assert(!text.includes(x.token), 'live_match leaked the referee token');
  assert(!/token|hash|secret/i.test(text), 'live_match returned a secret-looking field');
});

await check('gets nothing for an unknown slug', async () => {
  assert((await live(code(10))) === null, 'unknown slug returned a match');
});

// A permission denial specifically — any other error (a timeout, say) would
// prove nothing about whether the table is closed.
await check('cannot read any table directly', async () => {
  for (const table of ['matches', 'match_secrets', 'rallies']) {
    refused(await db.from(table).select('*').limit(1), '42501');
  }
});

await check('cannot write a table directly', async () => {
  const { voidedBy: _, ...row } = rally(50, 'A');
  refused(await db.from('rallies').insert({ ...row, match_id: x.match.id }), '42501');
});

console.log('\nAttacker');

await check('cannot write with the wrong token', async () => {
  refused(await sync(x, code(32), [rally(3, 'B')]), '42501');
  assert((await live(x.match.slug)).rallies.length === 3, 'a rally was written without the token');
});

await check('cannot take over a match by re-creating it with a new token', async () => {
  const hijack = { ...x, match: { ...x.match, lineup: { A: ['Hijack'], B: ['Hijack'] } } };
  refused(await sync(hijack, code(32), []), '42501');
  assert((await live(x.match.slug)).lineup.A[0] === 'Smoke X A1', 'the lineup was overwritten');
});

await check("cannot void another match's rally using their own token", async () => {
  const y = newMatch('Y');
  const { error } = await sync(y, y.token, [{ ...opening[0], voidedBy: 'attack' }]);
  assert(!error, `own-match sync failed unexpectedly: ${error?.message}`);
  const target = (await live(x.match.slug)).rallies.find((r) => r.id === opening[0].id);
  assert(target && target.voidedBy === null, `victim rally was altered: ${JSON.stringify(target)}`);
  assert((await live(y.match.slug)).rallies.length === 0, "victim rally was moved into the attacker's match");
});

console.log('\nHistory');

await check('a tombstone cannot be cleared', async () => {
  await sync(x, x.token, [{ ...opening[2], voidedBy: null }]);
  const found = (await live(x.match.slug)).rallies.find((r) => r.id === opening[2].id);
  assert(found.voidedBy === 'undo-1', 'an undone rally was brought back');
});

await check('a recorded rally cannot be rewritten', async () => {
  await sync(x, x.token, [{ ...opening[0], winner: 'B', seq: 7 }]);
  const found = (await live(x.match.slug)).rallies.find((r) => r.id === opening[0].id);
  assert(found.winner === 'A' && found.seq === 0, `rally was rewritten: ${JSON.stringify(found)}`);
});

await check('two rallies cannot share a seq', async () => {
  refused(await sync(x, x.token, [rally(0, 'B')]), '23505');
});

console.log('\nLimits');

await check('rejects a winner that is not A or B', async () => {
  refused(await sync(x, x.token, [rally(10, 'C')]), '23514');
});

await check('rejects an oversized batch', async () => {
  const batch = Array.from({ length: 501 }, (_, i) => rally(100 + i, 'A'));
  refused(await sync(x, x.token, batch), '22023');
});

await check('rejects a token too short to be secret', async () => {
  refused(await sync(newMatch('Short'), 'short', []), '22023');
});

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
