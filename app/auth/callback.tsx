import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/session';
import { takeNext } from '@/auth/signIn';
import { useTheme } from '@/design/theme';

/**
 * Where Google sends people back to. supabase-js has already traded the code
 * in the URL for a session by the time it reports one, so all this page does
 * is wait for that, then return the player to wherever they started.
 */
export default function AuthCallback() {
  const theme = useTheme();
  const router = useRouter();
  const status = useAuth((s) => s.status);
  const { error } = useLocalSearchParams<{ error?: string }>();
  // Only words written here. The error_description in the URL is never shown:
  // anyone can craft a link that sets it, and Deuce's own page saying
  // "your account is suspended, call this number" is a phishing kit.
  const refused = error
    ? error === 'access_denied'
      ? 'You cancelled signing in with Google.'
      : "Google didn't complete the sign-in."
    : null;

  useEffect(() => {
    if (status === 'signedIn') router.replace(takeNext() as Href);
  }, [status, router]);

  if (status === 'unavailable') return <Redirect href="/" />;

  const failed = Boolean(refused) || status === 'signedOut';

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Text style={[styles.brand, { color: theme.muted }]}>DEUCE</Text>
      <Text style={[styles.title, { color: theme.text }]}>
        {failed ? "Sign-in didn't finish" : 'Signing you in…'}
      </Text>
      {failed ? (
        <>
          <Text style={[styles.body, { color: theme.muted }]}>
            {refused ?? "Google didn't hand back a sign-in. It usually works on a second try."}
          </Text>
          <Pressable
            onPress={() => router.replace('/sign-in')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, { backgroundColor: theme.text, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.buttonText, { color: theme.background }]}>Try again</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  brand: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 420,
  },
  button: {
    height: 50,
    paddingHorizontal: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '800',
  },
});
