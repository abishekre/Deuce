import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

import { safeNext } from '@/auth/model';
import { useAuth } from '@/auth/session';
import { SignInScreen } from '@/auth/SignInScreen';

export default function SignIn() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const status = useAuth((s) => s.status);
  const destination = safeNext(next);

  // Already signed in, or nothing to sign in to: straight through.
  if (status === 'signedIn' || status === 'unavailable') return <Redirect href={destination as Href} />;
  return <SignInScreen next={destination} />;
}
