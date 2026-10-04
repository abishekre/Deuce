import { kv } from '@/data/kv';
import { getSupabase } from '@/data/supabase';

import { safeNext } from './model';

export type SignInResult = 'redirecting' | 'signedIn' | 'cancelled';

const NEXT_KEY = 'deuce.auth.next';

/**
 * Leave for Google and come back to /auth/callback, where supabase-js trades
 * the code for a session on its own (PKCE, so the code is useless to anyone
 * who intercepts the redirect without this browser's verifier).
 *
 * Where to go afterwards is kept on the device rather than in the redirect
 * URL, so the callback address stays exactly the one allow-listed in Supabase.
 */
export async function signInWithGoogle(next: string): Promise<SignInResult> {
  const client = getSupabase();
  if (!client) throw new Error('Sign-in is not available in this build');

  kv.set(NEXT_KEY, safeNext(next));
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw error;
  return 'redirecting';
}

/** Read and forget the page to return to. */
export function takeNext(): string {
  const next = kv.get(NEXT_KEY);
  kv.remove(NEXT_KEY);
  return safeNext(next);
}
