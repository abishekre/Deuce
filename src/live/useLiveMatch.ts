import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getSupabase } from '@/data/supabase';
import { SLUG_PATTERN, type LiveMatch } from '@/sync/protocol';
import { channelName, fetchLive, POKE_EVENT } from '@/sync/remote';

/**
 * The safety net under the realtime poke. Hall wifi drops sockets constantly;
 * a spectator whose channel has quietly died still sees the score move, just
 * a little later.
 */
const POLL_MS = 15_000;

export interface LiveState {
  status: 'unconfigured' | 'loading' | 'missing' | 'invalid' | 'ready';
  match: LiveMatch | null;
  /** The realtime channel is up. Without it the page still updates, by polling. */
  connected: boolean;
  /** The last fetch failed, so what is on screen may be behind. */
  stale: boolean;
}

export function useLiveMatch(rawSlug: string): LiveState {
  const client = getSupabase();
  const slug = rawSlug.trim().toUpperCase();
  const wellFormed = SLUG_PATTERN.test(slug);

  const [state, setState] = useState<LiveState>(() => ({
    status: !client ? 'unconfigured' : wellFormed ? 'loading' : 'missing',
    match: null,
    connected: false,
    stale: false,
  }));

  const inFlight = useRef(false);
  const again = useRef(false);

  // Pokes can arrive in bursts — a referee catching up after losing signal
  // sends several in a row. Coalesce them: one fetch in flight at a time, and
  // at most one more queued behind it.
  const refresh = useCallback(async () => {
    if (!client || !wellFormed) return;
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;

    try {
      do {
        again.current = false;
        const result = await fetchLive(client, slug);
        setState((prev) => {
          if (result.kind === 'found') return { ...prev, status: 'ready', match: result.match, stale: false };
          return { ...prev, status: result.kind, match: null, stale: false };
        });
      } while (again.current);
    } catch {
      setState((prev) => ({ ...prev, stale: true }));
    } finally {
      inFlight.current = false;
    }
  }, [client, slug, wellFormed]);

  useEffect(() => {
    if (!client || !wellFormed) return;

    void refresh();

    const channel = client
      .channel(channelName(slug))
      .on('broadcast', { event: POKE_EVENT }, () => void refresh())
      .subscribe((status) => {
        const connected = status === 'SUBSCRIBED';
        setState((prev) => ({ ...prev, connected }));
        // Anything poked while the socket was down was missed; catch up now.
        if (connected) void refresh();
      });

    const timer = setInterval(() => void refresh(), POLL_MS);
    const foreground = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });

    return () => {
      clearInterval(timer);
      foreground.remove();
      void client.removeChannel(channel);
    };
  }, [client, slug, wellFormed, refresh]);

  return state;
}
