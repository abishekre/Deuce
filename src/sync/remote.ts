import type { SupabaseClient } from '@supabase/supabase-js';

import type { Rally } from '@/rules';
import type { LocalMatch } from '@/scorer/match';

import { matchPayload, parseLiveMatch, rallyPayload, type LiveMatch } from './protocol';

export const channelName = (slug: string): string => `match:${slug}`;
export const POKE_EVENT = 'rally';

/**
 * Errors that retrying cannot fix: the token does not match, or the server
 * rejected the data itself. Anything else — above all, no signal — is worth
 * trying again.
 */
const PERMANENT = new Set(['42501', '22023', '22P02', '23505', '23514', '54000']);

export class SyncRejected extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'SyncRejected';
  }
}

/** Returns how many rallies the server now holds for the match. */
export async function pushMatch(client: SupabaseClient, match: LocalMatch, batch: readonly Rally[]): Promise<number> {
  const { data, error } = await client.rpc('sync_match', {
    p_match: matchPayload(match),
    p_token: match.refereeToken,
    p_rallies: batch.map(rallyPayload),
  });

  if (error) {
    if (error.code && PERMANENT.has(error.code)) throw new SyncRejected(error.code, error.message);
    throw error;
  }
  return data as number;
}

/**
 * Tell spectators to refetch.
 *
 * Deliberately carries no data. The channel is public, so anyone could send
 * on it — but a forged poke only makes spectators fetch the real rally log
 * again, from a function that serves nothing it was not given by the referee.
 * Sent over REST rather than a socket, so a referee on patchy hall wifi has no
 * connection to keep alive.
 */
export async function poke(client: SupabaseClient, slug: string): Promise<void> {
  const channel = client.channel(channelName(slug));
  try {
    await channel.httpSend(POKE_EVENT, {});
  } catch {
    // Spectators poll as well; a lost poke costs them a few seconds, nothing more.
  } finally {
    await client.removeChannel(channel);
  }
}

export type LiveFetch = { kind: 'found'; match: LiveMatch } | { kind: 'missing' } | { kind: 'invalid' };

export async function fetchLive(client: SupabaseClient, slug: string): Promise<LiveFetch> {
  const { data, error } = await client.rpc('live_match', { p_slug: slug });
  if (error) throw error;
  if (data === null) return { kind: 'missing' };

  const match = parseLiveMatch(data);
  return match ? { kind: 'found', match } : { kind: 'invalid' };
}
