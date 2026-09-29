import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SIDE_COLOR, STATUS_COLOR, useTheme, type Theme } from '@/design/theme';
import { LinkSheet } from '@/live/LinkSheet';
import { liveUrl, shareLiveLink } from '@/live/share';
import { gamesToWin, opponent, type Side } from '@/rules';
import { describeSync, type SyncLabel } from '@/sync/protocol';
import { useMatchSync } from '@/sync/useMatchSync';

import { feel } from './feedback';
import { lastLiveRally, scoreLocal, type LocalMatch } from './match';
import {
  callFor,
  describeFormat,
  earlierScores,
  pointCall,
  roleOf,
  scoreOf,
  sideLabel,
  sideOnLeft,
} from './present';
import { SidePanel } from './SidePanel';
import { useScorer } from './store';

const TOP_BAR = 60;
const CALL_BAR = 88;

/**
 * The referee's screen. Landscape puts the two sides left and right, like the
 * court seen from the umpire's chair; portrait stacks them. Either way the
 * halves swap at every change of ends, so a thumb on the left always means the
 * players at the left-hand end.
 */
export function ScorerScreen({ match }: { match: LocalMatch }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const point = useScorer((s) => s.point);
  const undo = useScorer((s) => s.undo);
  const flipView = useScorer((s) => s.flipView);
  const setAside = useScorer((s) => s.setAside);

  const state = useMemo(() => scoreLocal(match), [match]);
  const call = callFor(state, match.lineup);
  const last = lastLiveRally(match.rallies);
  const needed = gamesToWin(match.format);

  const landscape = width > height;
  const left = sideOnLeft(state, match.startingLeft);
  const order: Side[] = [left, opponent(left)];

  const onPoint = (side: Side) => {
    if (!point(side)) return;
    const after = useScorer.getState().match;
    feel(after && scoreLocal(after).current.complete ? 'game' : 'point');
  };

  const onUndo = () => {
    if (!last) return;
    undo();
    feel('undo');
  };

  const sync = describeSync(useMatchSync(match));
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [showLink, setShowLink] = useState(false);

  useEffect(() => {
    if (!shareNote) return;
    const timer = setTimeout(() => setShareNote(null), 2500);
    return () => clearTimeout(timer);
  }, [shareNote]);

  const onShare = async () => {
    const title = `${sideLabel(match.lineup, 'A')} v ${sideLabel(match.lineup, 'B')}`;
    const result = await shareLiveLink(match.slug, title);
    if (result === 'copied') setShareNote('Link copied');
    if (result === 'unavailable') setShowLink(true);
  };

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <View style={[styles.topBar, { height: TOP_BAR }]}>
        <BarButton label="New" accessibilityLabel="Set this match aside and start a new one" onPress={setAside} theme={theme} />
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {state.complete ? 'Final' : `Game ${state.current.index + 1}`}
          <Text style={{ color: theme.muted }}>{`  ·  ${describeFormat(match.format)}`}</Text>
        </Text>
        <View style={styles.actions}>
          <BarButton label="⇄" accessibilityLabel="Swap the sides of the screen" onPress={flipView} theme={theme} />
          <BarButton
            label="Undo"
            dot={last ? SIDE_COLOR[last.winner] : undefined}
            accessibilityLabel={last ? `Undo point to ${sideLabel(match.lineup, last.winner)}` : 'Nothing to undo'}
            onPress={onUndo}
            disabled={!last}
            theme={theme}
          />
        </View>
      </View>

      <View style={[styles.court, { flexDirection: landscape ? 'row' : 'column' }]}>
        {order.map((side) => (
          <SidePanel
            key={side}
            side={side}
            label={sideLabel(match.lineup, side)}
            names={match.lineup[side]}
            roles={match.lineup[side].map((_, index) => roleOf(state, side, index))}
            score={scoreOf(state.current, side)}
            earlier={earlierScores(state, side)}
            gamesWon={state.gamesWon[side]}
            gamesNeeded={needed}
            point={pointCall(state, side)}
            disabled={state.complete}
            theme={theme}
            onPoint={onPoint}
          />
        ))}
      </View>

      <View style={[styles.callBar, { minHeight: CALL_BAR, borderTopColor: theme.line }]} accessibilityLiveRegion="polite">
        <View style={styles.callText}>
          {call.headline ? (
            <Text style={[styles.headline, { color: theme.text }]} numberOfLines={2}>
              {call.headline}
            </Text>
          ) : null}
          {call.serve ? (
            <Text
              style={[styles.serve, { color: call.headline ? theme.muted : theme.text }]}
              numberOfLines={2}
            >
              {call.serve}
            </Text>
          ) : null}
        </View>
        {sync ? (
          <LivePill
            status={sync}
            note={shareNote}
            onPress={() => void onShare()}
            theme={theme}
          />
        ) : null}
        {call.tone === 'over' ? (
          <Pressable
            onPress={setAside}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primary, { backgroundColor: theme.text, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={[styles.primaryText, { color: theme.background }]}>New match</Text>
          </Pressable>
        ) : null}
      </View>

      {showLink ? (
        <LinkSheet slug={match.slug} url={liveUrl(match.slug)} onClose={() => setShowLink(false)} theme={theme} />
      ) : null}
    </View>
  );
}

/**
 * Whether the match is reaching spectators, and the way to invite them. One
 * control rather than two: the moment a referee wonders "is this live?" is
 * the moment they want to send the link.
 */
function LivePill({
  status,
  note,
  onPress,
  theme,
}: {
  status: SyncLabel;
  note: string | null;
  onPress: () => void;
  theme: Theme;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Share the live score link. ${note ?? status.text}`}
      style={({ pressed }) => [
        styles.livePill,
        { borderColor: theme.line, backgroundColor: pressed ? theme.line : theme.surface },
      ]}
    >
      <View style={[styles.liveDot, { backgroundColor: STATUS_COLOR[status.tone] }]} />
      <Text style={[styles.liveText, { color: theme.text }]} numberOfLines={1}>
        {note ?? status.text}
      </Text>
      {note ? null : <Text style={[styles.liveShare, { color: theme.muted }]}>Share</Text>}
    </Pressable>
  );
}

function BarButton({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
  dot,
  theme,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  dot?: string;
  theme: Theme;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.barButton,
        {
          borderColor: theme.line,
          backgroundColor: pressed ? theme.line : theme.surface,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      {dot ? <View style={[styles.barDot, { backgroundColor: dot }]} /> : null}
      <Text style={[styles.barButtonText, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  barButton: {
    minWidth: 48,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  barButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  barDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  court: {
    flex: 1,
    gap: 2,
  },
  callBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  callText: {
    flex: 1,
    gap: 4,
  },
  headline: {
    fontSize: 18,
    fontWeight: '800',
  },
  serve: {
    fontSize: 17,
    fontWeight: '600',
  },
  livePill: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  liveText: {
    fontSize: 15,
    fontWeight: '700',
  },
  liveShare: {
    fontSize: 15,
    fontWeight: '600',
  },
  primary: {
    height: 52,
    paddingHorizontal: 22,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontSize: 17,
    fontWeight: '800',
  },
});
