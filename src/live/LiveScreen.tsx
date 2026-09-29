import Head from 'expo-router/head';
import { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { STATUS_COLOR, useTheme, type Theme } from '@/design/theme';
import { gamesToWin, SIDES } from '@/rules';
import { scoreFrom } from '@/scorer/match';
import { callFor, describeFormat, earlierScores, pointCall, roleOf, scoreOf, sideLabel } from '@/scorer/present';
import { SidePanel } from '@/scorer/SidePanel';

import { useLiveMatch, type LiveState } from './useLiveMatch';

/**
 * What a spectator sees when they open a shared link: the referee's screen,
 * read-only, folded from the same rally log by the same engine.
 *
 * Side A stays left (or on top). Mirroring the court at each change of ends
 * helps the person holding the phone at the net post; it only confuses a
 * parent watching from the stands, or from home.
 */
export function LiveScreen({ slug }: { slug: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const live = useLiveMatch(slug);

  const state = useMemo(() => {
    if (!live.match) return null;
    try {
      return scoreFrom(live.match.format, live.match.rallies, live.match.firstServer);
    } catch {
      // A format the engine rejects. Say so rather than show a wrong score.
      return null;
    }
  }, [live.match]);

  if (live.status !== 'ready' || !live.match) return <Notice live={live} theme={theme} />;
  if (!state) {
    return <Notice live={{ ...live, status: 'invalid' }} theme={theme} />;
  }

  const { lineup, format } = live.match;
  const call = callFor(state, lineup);
  const needed = gamesToWin(format);
  // The score leads, so a spectator who has switched to another tab can still
  // follow the match from the tab strip.
  const score = state.complete ? 'Final' : `${state.current.scoreA}–${state.current.scoreB}`;
  const title = `${score} · ${sideLabel(lineup, 'A')} v ${sideLabel(lineup, 'B')}`;

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <Head>
        <title>{title}</title>
      </Head>

      <View style={styles.header}>
        <Text style={[styles.brand, { color: theme.muted }]}>DEUCE</Text>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {state.complete ? 'Final' : `Game ${state.current.index + 1}`}
          <Text style={{ color: theme.muted }}>{`  ·  ${describeFormat(format)}`}</Text>
        </Text>
        <Connection live={live} complete={state.complete} theme={theme} />
      </View>

      <View style={[styles.court, { flexDirection: width > height ? 'row' : 'column' }]}>
        {SIDES.map((side) => (
          <SidePanel
            key={side}
            side={side}
            label={sideLabel(lineup, side)}
            names={lineup[side]}
            roles={lineup[side].map((_, index) => roleOf(state, side, index))}
            score={scoreOf(state.current, side)}
            earlier={earlierScores(state, side)}
            gamesWon={state.gamesWon[side]}
            gamesNeeded={needed}
            point={pointCall(state, side)}
            theme={theme}
          />
        ))}
      </View>

      <View style={[styles.callBar, { borderTopColor: theme.line }]} accessibilityLiveRegion="polite">
        {call.headline ? (
          <Text style={[styles.headline, { color: theme.text }]} numberOfLines={2}>
            {call.headline}
          </Text>
        ) : null}
        {call.serve ? (
          <Text style={[styles.serve, { color: call.headline ? theme.muted : theme.text }]} numberOfLines={2}>
            {call.serve}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Connection({ live, complete, theme }: { live: LiveState; complete: boolean; theme: Theme }) {
  if (complete) return null;

  const healthy = live.connected && !live.stale;
  return (
    <View style={styles.connection} accessibilityLabel={healthy ? 'Live' : 'Reconnecting'}>
      <View style={[styles.dot, { backgroundColor: healthy ? STATUS_COLOR.good : STATUS_COLOR.warn }]} />
      <Text style={[styles.connectionText, { color: theme.text }]}>{healthy ? 'Live' : 'Reconnecting'}</Text>
    </View>
  );
}

const NOTICES: Record<Exclude<LiveState['status'], 'ready'>, { title: string; body: string }> = {
  loading: { title: 'Loading match…', body: '' },
  missing: {
    title: 'Not live yet',
    body: "This match hasn't reached the server yet, or the link has a typo. It will appear here by itself as soon as it does.",
  },
  invalid: {
    title: "This match can't be shown",
    body: 'The score data for this link is damaged. Ask the referee to share the link again.',
  },
  unconfigured: {
    title: 'Live scores are off',
    body: 'This build of Deuce has no server configured, so shared links cannot load.',
  },
};

function Notice({ live, theme }: { live: LiveState; theme: Theme }) {
  const status = live.status === 'ready' ? 'loading' : live.status;
  const { title, body } = NOTICES[status];

  return (
    <View style={[styles.notice, { backgroundColor: theme.background }]}>
      <Head>
        <title>Deuce</title>
      </Head>
      <Text style={[styles.brand, { color: theme.muted }]}>DEUCE</Text>
      <Text style={[styles.noticeTitle, { color: theme.text }]}>{title}</Text>
      {body ? <Text style={[styles.noticeBody, { color: theme.muted }]}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  brand: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  connection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  connectionText: {
    fontSize: 15,
    fontWeight: '700',
  },
  court: {
    flex: 1,
    gap: 2,
  },
  callBar: {
    minHeight: 76,
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  headline: {
    fontSize: 18,
    fontWeight: '800',
  },
  serve: {
    fontSize: 17,
    fontWeight: '600',
  },
  notice: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 32,
  },
  noticeTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  noticeBody: {
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 420,
  },
});
