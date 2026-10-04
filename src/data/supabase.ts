import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { authStorage } from './authStorage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

/**
 * The Supabase client, or `null` when the build has no project configured.
 *
 * Null rather than a thrown error because scoring on the device alone is a
 * supported mode, not a failure: a build with no backend still gets a working
 * scorer — just no sign-in and no live link.
 */
export function getSupabase(): SupabaseClient | null {
  if (!url || !key) return null;
  if (client) return client;

  client = createClient(url, key, {
    auth: {
      storage: authStorage,
      persistSession: true,
      autoRefreshToken: true,
      // Only the web build receives the sign-in result in its own URL; a
      // phone gets it back from the in-app browser instead.
      detectSessionInUrl: Platform.OS === 'web',
      flowType: 'pkce',
    },
    global: { headers: { 'x-client-info': 'deuce' } },
  });

  bindTokenRefresh(client);
  return client;
}

/**
 * Supabase's refresh timer keeps firing while a phone app is in the
 * background, which means failed refreshes and, eventually, a referee signed
 * out for having locked their phone between matches. Pausing it outside the
 * foreground is the documented fix; the web manages its own tabs.
 */
function bindTokenRefresh(instance: SupabaseClient): void {
  if (Platform.OS === 'web') return;

  AppState.addEventListener('change', (state) => {
    if (state === 'active') void instance.auth.startAutoRefresh();
    else void instance.auth.stopAutoRefresh();
  });
}
