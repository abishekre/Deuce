import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

/**
 * The Supabase client, or `null` when the build has no project configured.
 *
 * Null rather than a thrown error because scoring on the device alone is a
 * supported mode, not a failure: a referee with no connection, or a build
 * with no backend, still gets a working scorer — just no live link.
 *
 * No auth session. Writes are authorised by the per-match referee token and
 * reads by the public slug, so there is nothing to sign in to.
 */
export function getSupabase(): SupabaseClient | null {
  if (!url || !key) return null;

  client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-client-info': 'deuce' } },
  });

  return client;
}
