import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { SIDE_COLOR, type Theme } from '@/design/theme';
import type { Side } from '@/rules';

import type { PointCall, Role } from './present';

interface Props {
  side: Side;
  label: string;
  names: readonly string[];
  roles: readonly Role[];
  score: number;
  earlier: readonly number[];
  gamesWon: number;
  gamesNeeded: number;
  point: PointCall;
  disabled?: boolean;
  theme: Theme;
  /** Absent for spectators: the same panel, read-only. */
  onPoint?: (side: Side) => void;
}

/**
 * The largest score that fits the space left over once the names and the game
 * dots have taken theirs. Two tabular digits in a heavy weight run about 1.3×
 * the font size wide, and the line needs a touch over 1× tall — "21" and "30"
 * are the widest numbers the panel ever shows.
 */
function scoreFontSize(width: number, height: number): number {
  return Math.round(Math.max(40, Math.min(280, height / 1.08, width / 1.3)));
}

/**
 * Half the screen, and the whole of the referee's job: tap the side that won
 * the rally. Everything else on the panel is there so they can do that without
 * looking down for longer than a glance.
 */
export function SidePanel({
  side,
  label,
  names,
  roles,
  score,
  earlier,
  gamesWon,
  gamesNeeded,
  point,
  disabled = false,
  theme,
  onPoint,
}: Props) {
  const color = SIDE_COLOR[side];
  const [fontSize, setFontSize] = useState<number | null>(null);

  const measure = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setFontSize(scoreFontSize(width, height));
  };

  const body = (pressed: boolean) => (
    <>
      <View style={[StyleSheet.absoluteFill, styles.veil, { opacity: pressed ? 1 : 0 }]} />

      <View style={styles.top}>
        <View style={styles.names}>
          {names.map((name, index) => {
            const role = roles[index] ?? null;
            return (
              <View key={index} style={styles.nameRow}>
                <Text style={[styles.name, role === 'serve' && styles.serving]} numberOfLines={1}>
                  {name}
                </Text>
                {role === 'serve' ? (
                  <Text style={[styles.pill, styles.servePill, { color }]}>SERVE</Text>
                ) : role === 'receive' ? (
                  <Text style={[styles.pill, styles.receivePill]}>RECEIVE</Text>
                ) : null}
              </View>
            );
          })}
        </View>

        {point ? (
          <Text style={[styles.pill, styles.pointPill, { backgroundColor: theme.callout, color: theme.calloutText }]}>
            {point === 'match' ? 'MATCH POINT' : 'GAME POINT'}
          </Text>
        ) : null}
      </View>

      <View style={styles.scoreBox} onLayout={measure}>
        {fontSize ? (
          <Text
            style={[styles.score, { fontSize, lineHeight: Math.round(fontSize * 1.05) }]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {score}
          </Text>
        ) : null}
      </View>

      <View style={styles.bottom}>
        <View style={styles.dots} accessibilityLabel={`${gamesWon} of ${gamesNeeded} games won`}>
          {Array.from({ length: gamesNeeded }, (_, index) => (
            <View key={index} style={[styles.dot, index < gamesWon && styles.dotWon]} />
          ))}
        </View>
        {earlier.length > 0 ? <Text style={styles.earlier}>{earlier.join('   ')}</Text> : null}
      </View>
    </>
  );

  if (!onPoint) {
    return (
      <View
        accessible
        accessibilityLabel={`${label}, ${score}`}
        style={[styles.panel, { backgroundColor: color }]}
      >
        {body(false)}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => onPoint(side)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Point to ${label}, currently ${score}`}
      style={[styles.panel, { backgroundColor: color }]}
    >
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    padding: 20,
    gap: 8,
    overflow: 'hidden',
  },
  scoreBox: {
    // Takes whatever the names and dots leave, and may shrink below its
    // content — the font is then sized to fit it, not the other way round.
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  veil: {
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    pointerEvents: 'none',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  names: {
    flex: 1,
    gap: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '500',
    flexShrink: 1,
  },
  serving: {
    fontWeight: '800',
  },
  pill: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  servePill: {
    backgroundColor: '#FFFFFF',
  },
  receivePill: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    color: '#FFFFFF',
  },
  pointPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  score: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    includeFontPadding: false,
  },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.7)',
  },
  dotWon: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  earlier: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
