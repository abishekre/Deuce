import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getSupabase } from '@/data/supabase';
import { useTheme, type Theme } from '@/design/theme';

import { createMyProfile, updateMyProfile } from './api';
import { formatPhone, normalizePhone, refusalMessage, type MyProfile } from './model';
import { googleName, refreshProfile, signOut, useAuth } from './session';

/**
 * Your own player profile: create it the first time, edit it after. The phone
 * number is set once — it is the private key that matches you across every
 * organiser who enters you, so changing it needs a proof this app does not
 * have yet.
 */
export function ProfileScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useAuth((s) => s.session);
  const profile = useAuth((s) => s.profile);

  useEffect(() => {
    if (profile === undefined) void refreshProfile();
  }, [profile]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: theme.background }]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 28 }]}
      >
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          accessibilityLabel="Back to scoring"
          hitSlop={8}
          style={styles.back}
        >
          <Text style={[styles.backText, { color: theme.muted }]}>← Scoring</Text>
        </Pressable>

        <View>
          <Text style={[styles.brand, { color: theme.muted }]}>DEUCE</Text>
          <Text style={[styles.title, { color: theme.text }]}>
            {profile === null ? 'Create your profile' : 'Your profile'}
          </Text>
        </View>

        {profile === undefined ? (
          <Text style={[styles.note, { color: theme.muted }]}>Loading…</Text>
        ) : (
          <ProfileForm key={profile?.id ?? 'new'} profile={profile} prefillName={googleName(session)} theme={theme} />
        )}

        <View style={[styles.account, { borderTopColor: theme.line }]}>
          <Text style={[styles.note, { color: theme.muted }]}>
            Signed in as {session?.user.email ?? 'your Google account'}
          </Text>
          <Pressable
            onPress={() => void signOut()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.secondary, { borderColor: theme.line, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.secondaryText, { color: theme.text }]}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ProfileForm({
  profile,
  prefillName,
  theme,
}: {
  profile: MyProfile | null;
  prefillName: string;
  theme: Theme;
}) {
  const creating = profile === null;
  const [name, setName] = useState(profile?.displayName ?? prefillName);
  const [phone, setPhone] = useState('');
  const [club, setClub] = useState(profile?.club ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);

  const unchanged =
    !creating && name === profile.displayName && club === (profile.club ?? '') && city === (profile.city ?? '');

  const save = async () => {
    const client = getSupabase();
    if (!client) return;

    const normalised = creating ? normalizePhone(phone) : null;
    if (creating && !normalised) {
      setMessage({ tone: 'error', text: refusalMessage('phone_invalid') });
      return;
    }

    setBusy(true);
    setMessage(null);
    const outcome = creating
      ? await createMyProfile(client, { displayName: name, phone: normalised!, club, city })
      : await updateMyProfile(client, { displayName: name, club, city });
    setBusy(false);

    if (!outcome.ok) {
      setMessage({ tone: 'error', text: refusalMessage(outcome.reason) });
      return;
    }
    setMessage({ tone: 'ok', text: creating ? 'Profile created.' : 'Saved.' });
    await refreshProfile();
  };

  return (
    <View style={styles.form}>
      <Field label="Name" theme={theme} value={name} onChangeText={setName} autoComplete="name" maxLength={60} />

      {creating ? (
        <Field
          label="Mobile number"
          hint="Only you can see it. It's how an organiser's entry finds you, so your matches land on this profile."
          theme={theme}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder="98765 43210"
        />
      ) : (
        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.muted }]}>Mobile number</Text>
          <Text style={[styles.value, { color: theme.text }]}>{profile.phone ? formatPhone(profile.phone) : '—'}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>Only you can see this.</Text>
        </View>
      )}

      <Field label="Club" theme={theme} value={club} onChangeText={setClub} maxLength={80} placeholder="Optional" />
      <Field label="City" theme={theme} value={city} onChangeText={setCity} maxLength={80} placeholder="Optional" />

      <Pressable
        onPress={() => void save()}
        disabled={busy || unchanged}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || unchanged, busy }}
        style={({ pressed }) => [
          styles.primary,
          { backgroundColor: theme.text, opacity: busy || unchanged ? 0.4 : pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={[styles.primaryText, { color: theme.background }]}>
          {busy ? 'Saving…' : creating ? 'Create profile' : 'Save changes'}
        </Text>
      </Pressable>

      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.message, { color: message.tone === 'error' ? theme.danger : theme.muted }]}
        >
          {message.text}
        </Text>
      ) : null}
    </View>
  );
}

function Field({ label, hint, theme, ...input }: { label: string; hint?: string; theme: Theme } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        placeholderTextColor={theme.muted}
        style={[styles.input, { color: theme.text, borderColor: theme.line, backgroundColor: theme.surface }]}
      />
      {hint ? <Text style={[styles.hint, { color: theme.muted }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 22,
  },
  back: {
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 15,
    fontWeight: '700',
  },
  brand: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    marginTop: 4,
  },
  form: {
    gap: 18,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 17,
  },
  value: {
    fontSize: 17,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
  primary: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryText: {
    fontSize: 18,
    fontWeight: '800',
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
  },
  account: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 20,
    gap: 12,
  },
  note: {
    fontSize: 15,
  },
  secondary: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
