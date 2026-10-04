import { Redirect, usePathname, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/design/theme';

import { useAuth } from './session';

/**
 * Gate for anything that writes: scoring, and the profile. Spectator links
 * never go through this — watching a match never needs an account.
 *
 * A build with no backend has nothing to sign in to, so it stays open rather
 * than locking the scorer forever.
 */
export function RequireSignIn({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status);
  const pathname = usePathname();
  const theme = useTheme();

  // A blank page in the app's own colour for the instant it takes to read the
  // stored session — never a flash of the sign-in screen for someone signed in.
  if (status === 'loading') return <View style={{ flex: 1, backgroundColor: theme.background }} />;

  if (status === 'signedOut') {
    return <Redirect href={`/sign-in?next=${encodeURIComponent(pathname)}` as Href} />;
  }

  return <>{children}</>;
}
