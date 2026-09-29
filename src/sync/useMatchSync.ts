import { useCallback, useEffect, useRef, useState } from 'react';

import { getSupabase } from '@/data/supabase';
import type { LocalMatch } from '@/scorer/match';

import { acknowledge, pendingRallies, SYNC_BATCH, type Acked, type SyncStatus } from './protocol';
import { poke, pushMatch, SyncRejected } from './remote';

/**
 * How often to retry while anything is unsent. Short on purpose: a referee
 * who walks back into signal should see the link come live again without
 * touching anything.
 */
const RETRY_MS = 4000;

interface Progress {
  matchId: string;
  /** The server has accepted this match at least once. */
  created: boolean;
  acked: Acked;
  rejected: boolean;
}

const fresh = (matchId: string): Progress => ({ matchId, created: false, acked: new Map(), rejected: false });

/**
 * Keeps the server's copy of a match in step with this device.
 *
 * The device's rally log stays the source of truth; this hook only ever
 * pushes. It runs after every change, and on a timer while anything is
 * outstanding, so a phone that loses signal mid-game catches up by itself
 * once it is back.
 */
export function useMatchSync(match: LocalMatch): SyncStatus {
  const client = getSupabase();

  const latest = useRef(match);
  latest.current = match;

  const progress = useRef<Progress>(fresh(match.id));
  if (progress.current.matchId !== match.id) progress.current = fresh(match.id);

  const inFlight = useRef(false);
  const [failed, setFailed] = useState(false);
  const [, rerender] = useState(0);

  const flush = useCallback(async () => {
    if (!client || inFlight.current || progress.current.rejected) return;
    inFlight.current = true;
    let attempted: string | null = null;

    try {
      for (;;) {
        const current = latest.current;
        const state = progress.current;
        if (state.matchId !== current.id) break;
        attempted = current.id;

        const batch = pendingRallies(current.rallies, state.acked).slice(0, SYNC_BATCH);
        // An empty first push still matters: it creates the match, so a link
        // shared before the first serve already works.
        if (batch.length === 0 && state.created) break;

        await pushMatch(client, current, batch);

        // The referee may have moved to another match while this was in flight.
        if (progress.current !== state) break;
        progress.current = { ...state, created: true, acked: acknowledge(state.acked, batch) };
        rerender((n) => n + 1);
        void poke(client, current.slug);
      }
      setFailed(false);
    } catch (error) {
      // Only the match that was refused stops retrying — not one the referee
      // switched to while the refused request was in flight.
      if (error instanceof SyncRejected && progress.current.matchId === attempted) {
        progress.current = { ...progress.current, rejected: true };
      }
      setFailed(true);
    } finally {
      inFlight.current = false;
    }
  }, [client]);

  useEffect(() => {
    void flush();
  }, [flush, match.id, match.rallies]);

  useEffect(() => {
    if (!client) return;
    const timer = setInterval(() => {
      const state = progress.current;
      if (!state.created || pendingRallies(latest.current.rallies, state.acked).length > 0) void flush();
    }, RETRY_MS);
    return () => clearInterval(timer);
  }, [client, flush]);

  if (!client) return { kind: 'local' };

  const { created, acked, rejected } = progress.current;
  const pending = pendingRallies(match.rallies, acked).length;

  if (rejected) return { kind: 'rejected' };
  if (failed) return { kind: 'waiting', pending, created };
  if (!created) return { kind: 'starting' };
  return { kind: 'live', pending };
}
