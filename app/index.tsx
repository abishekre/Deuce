import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { BWF_21, scoreMatch, type Rally } from '@/rules';

/**
 * Scaffold placeholder.
 *
 * M0 is the rules engine and nothing else, so this screen exists only to prove
 * the engine imports cleanly into the app and that the toolchain boots. The
 * referee scorer is M1 — see PLAN.md.
 */

const SAMPLE: Rally[] = [...'AABBABAA'].map((winner, seq) => ({
  id: `sample-${seq}`,
  seq,
  winner: winner as 'A' | 'B',
}));

export default function Index() {
  const state = scoreMatch(BWF_21('doubles'), SAMPLE);
  const { current, serve } = state;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.label}>Deuce · M0 rules engine</Text>
        <Text style={styles.score}>
          {current.scoreA} – {current.scoreB}
        </Text>
        <Text style={styles.detail}>
          {serve
            ? `Side ${serve.server} serving from the ${serve.court} court, player ${serve.serverIndex}`
            : 'No live serve'}
        </Text>
        <Text style={styles.detail}>{state.rallyCount} rallies folded</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { gap: 8, alignItems: 'center' },
  label: { fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.6 },
  score: { fontSize: 64, fontVariant: ['tabular-nums'], fontWeight: '700' },
  detail: { fontSize: 15, opacity: 0.7, textAlign: 'center' },
});
