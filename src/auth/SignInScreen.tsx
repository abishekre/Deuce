import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/design/theme';

import { GoogleButton } from './GoogleButton';
import { signInWithGoogle } from './signIn';

export function SignInScreen({ next }: { next: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await signInWithGoogle(next);
      if (result === 'signedIn') router.replace(next as Href);
      if (result === 'cancelled') setBusy(false);
      // 'redirecting': the page is leaving for Google, so it stays busy.
    } catch {
      setError("Couldn't reach Google. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: theme.background, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.content}>
        <Text style={[styles.brand, { color: theme.muted }]}>DEUCE</Text>
        <Text style={[styles.title, { color: theme.text }]}>Sign in to score</Text>
        <Text style={[styles.body, { color: theme.muted }]}>
          Every match you play or referee stays on your profile, from one event to the next. Watching a match never
          needs an account.
        </Text>

        <GoogleButton onPress={() => void onGoogle()} busy={busy} />

        {error ? (
          <Text style={[styles.error, { color: theme.danger }]} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: 16,
  },
  brand: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 8,
  },
  error: {
    fontSize: 15,
    lineHeight: 21,
  },
});
