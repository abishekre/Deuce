import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { getSupabase } from '@/data/supabase';

import { fetchMyProfile } from './api';
import type { MyProfile } from './model';

export type AuthStatus =
  /** No backend in this build: nothing to sign in to, and the scorer stays open. */
  | 'unavailable'
  | 'loading'
  | 'signedOut'
  | 'signedIn';

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  /** `undefined` while it loads; `null` for an account with no player profile yet. */
  profile: MyProfile | null | undefined;
}

export const useAuth = create<AuthState>(() => ({
  status: getSupabase() ? 'loading' : 'unavailable',
  session: null,
  profile: undefined,
}));

let started = false;

/**
 * Follow the session for the life of the app. Called once, from the root
 * layout. supabase-js finishes any sign-in returning in the URL before it
 * reports the first session, so a page that just came back from Google sees
 * the account straight away.
 */
export function startAuth(): void {
  const client = getSupabase();
  if (!client || started) return;
  started = true;

  client.auth.onAuthStateChange((_event, session) => {
    const userChanged = session?.user.id !== useAuth.getState().session?.user.id;
    useAuth.setState({
      session,
      status: session ? 'signedIn' : 'signedOut',
      ...(userChanged ? { profile: session ? undefined : null } : {}),
    });
    // Outside the callback: supabase-js warns against awaiting its own calls
    // inside onAuthStateChange, which can deadlock the client.
    if (session && userChanged) setTimeout(() => void refreshProfile(), 0);
  });
}

export async function refreshProfile(): Promise<void> {
  const client = getSupabase();
  const userId = useAuth.getState().session?.user.id;
  if (!client || !userId) return;

  try {
    const profile = await fetchMyProfile(client);
    // Ignore an answer that arrives after the account has changed.
    if (useAuth.getState().session?.user.id === userId) useAuth.setState({ profile });
  } catch {
    // Offline, most likely. Leave it unknown and let the next screen retry.
  }
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut();
}

/** The name Google gave us, to prefill the profile form. */
export function googleName(session: Session | null): string {
  const meta = session?.user.user_metadata ?? {};
  const name = meta.full_name ?? meta.name;
  return typeof name === 'string' ? name : '';
}
