import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { getSupabase } from '@/data/supabase';

export type SignInResult = 'redirecting' | 'signedIn' | 'cancelled';

/**
 * Native sign-in: Google opens in an in-app browser session, which hands the
 * deuce://auth/callback redirect straight back here instead of to the
 * operating system. The code is then traded for a session with the verifier
 * this device generated (PKCE).
 *
 * Not yet exercised on a device — the app ships on the web first. Before an
 * Android build, add deuce://auth/callback to Supabase's allowed redirect URLs.
 */
export async function signInWithGoogle(_next: string): Promise<SignInResult> {
  const client = getSupabase();
  if (!client) throw new Error('Sign-in is not available in this build');

  const redirectTo = Linking.createURL('auth/callback');
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return 'cancelled';

  const { queryParams } = Linking.parse(result.url);
  const code = queryParams?.code;
  if (typeof code !== 'string') {
    const reason = queryParams?.error_description;
    throw new Error(typeof reason === 'string' ? reason : 'Google did not return a sign-in code');
  }

  const exchanged = await client.auth.exchangeCodeForSession(code);
  if (exchanged.error) throw exchanged.error;
  return 'signedIn';
}

/** Native sign-in returns to the screen that started it, so there is nothing stored. */
export function takeNext(): string {
  return '/';
}
