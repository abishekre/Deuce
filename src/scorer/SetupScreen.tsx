import { useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SIDE_COLOR, useTheme, type Theme } from '@/design/theme';
import { FORMAT_PRESETS, SIDES, type Discipline, type FormatPresetKey, type Side } from '@/rules';

import { DEFAULT_INPUT, lineupFrom, scoreLocal, type LocalMatch, type MatchInput } from './match';
import { sideLabel } from './present';
import { useScorer } from './store';

const PRESETS = Object.keys(FORMAT_PRESETS) as FormatPresetKey[];

const DISCIPLINES: ReadonlyArray<readonly [Discipline, string]> = [
  ['singles', 'Singles'],
  ['doubles', 'Doubles'],
];

/**
 * Every field is optional. Blank names become numbered players, so a referee
 * handed the phone at the net post can be scoring after a single tap.
 */
export function SetupScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const lastInput = useScorer((s) => s.lastInput);
  const previous = useScorer((s) => s.previous);
  const start = useScorer((s) => s.start);
  const restore = useScorer((s) => s.restore);

  const [input, setInput] = useState<MatchInput>(lastInput);

  const doubles = input.discipline === 'doubles';
  const placeholders = lineupFrom({ ...input, names: DEFAULT_INPUT.names });
  const lineup = lineupFrom(input);

  const setName = (side: Side, index: 0 | 1, value: string) =>
    setInput((prev) => {
      const pair: [string, string] = [...prev.names[side]];
      pair[index] = value;
      return { ...prev, names: { ...prev.names, [side]: pair } };
    });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: theme.background }]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 },
        ]}
      >
        <View>
          <Text style={[styles.brand, { color: theme.muted }]}>DEUCE</Text>
          <Text style={[styles.title, { color: theme.text }]}>New match</Text>
        </View>

        {previous ? <PreviousMatch match={previous} onRestore={restore} theme={theme} /> : null}

        <Field label="Discipline" theme={theme}>
          <Segmented
            options={DISCIPLINES}
            value={input.discipline}
            onChange={(discipline) => setInput((prev) => ({ ...prev, discipline }))}
            theme={theme}
          />
        </Field>

        <Field label="Format" theme={theme}>
          <View style={styles.chips}>
            {PRESETS.map((key) => {
              const selected = input.preset === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setInput((prev) => ({ ...prev, preset: key }))}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.chip,
                    { borderColor: selected ? theme.text : theme.line, backgroundColor: selected ? theme.text : theme.surface },
                  ]}
                >
                  <Text style={[styles.chipText, { color: selected ? theme.background : theme.text }]}>
                    {FORMAT_PRESETS[key].label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        {SIDES.map((side) => (
          <View key={side} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.line }]}>
            <View style={styles.cardHeader}>
              <View style={[styles.swatch, { backgroundColor: SIDE_COLOR[side] }]} />
              <Text style={[styles.cardTitle, { color: theme.text }]}>Side {side}</Text>
            </View>
            {([0, 1] as const).slice(0, doubles ? 2 : 1).map((index) => (
              <View key={index} style={styles.inputGroup}>
                <TextInput
                  value={input.names[side][index]}
                  onChangeText={(value) => setName(side, index, value)}
                  placeholder={placeholders[side][index]}
                  placeholderTextColor={theme.muted}
                  autoCapitalize="words"
                  autoCorrect={false}
                  accessibilityLabel={`Side ${side}, player ${index + 1}`}
                  style={[
                    styles.input,
                    { color: theme.text, borderColor: theme.line, backgroundColor: theme.background },
                  ]}
                />
                {doubles ? (
                  <Text style={[styles.hint, { color: theme.muted }]}>
                    {index === 0 ? 'Starts in the right court' : 'Starts in the left court'}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ))}

        <Field label="Serves first" theme={theme}>
          <Segmented
            options={SIDES.map((side) => [side, sideLabel(lineup, side)] as const)}
            value={input.firstServer}
            onChange={(firstServer) => setInput((prev) => ({ ...prev, firstServer }))}
            fills={SIDE_COLOR}
            theme={theme}
          />
        </Field>

        <Pressable
          onPress={() => start(input)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.start, { backgroundColor: theme.text, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={[styles.startText, { color: theme.background }]}>Start match</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PreviousMatch({ match, onRestore, theme }: { match: LocalMatch; onRestore: () => void; theme: Theme }) {
  const state = scoreLocal(match);
  const where = state.complete
    ? 'Finished'
    : `${state.current.scoreA}–${state.current.scoreB} in game ${state.current.index + 1}`;

  return (
    <View style={[styles.card, styles.previous, { backgroundColor: theme.surface, borderColor: theme.line }]}>
      <View style={styles.previousText}>
        <Text style={[styles.hint, { color: theme.muted }]}>Previous match</Text>
        <Text style={[styles.previousTitle, { color: theme.text }]} numberOfLines={1}>
          {sideLabel(match.lineup, 'A')} v {sideLabel(match.lineup, 'B')}
        </Text>
        <Text style={[styles.hint, { color: theme.muted }]}>{where}</Text>
      </View>
      <Pressable
        onPress={onRestore}
        accessibilityRole="button"
        accessibilityLabel="Reopen the previous match"
        style={({ pressed }) => [styles.reopen, { borderColor: theme.text, opacity: pressed ? 0.7 : 1 }]}
      >
        <Text style={[styles.reopenText, { color: theme.text }]}>Reopen</Text>
      </Pressable>
    </View>
  );
}

function Field({ label, theme, children }: { label: string; theme: Theme; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>
      {children}
    </View>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  fills,
  theme,
}: {
  options: ReadonlyArray<readonly [T, string]>;
  value: T;
  onChange: (value: T) => void;
  /** Per-option fill when selected — side colours for the serve toggle. */
  fills?: Partial<Record<T, string>>;
  theme: Theme;
}) {
  return (
    <View style={[styles.segmented, { backgroundColor: theme.surface, borderColor: theme.line }]}>
      {options.map(([key, label]) => {
        const selected = key === value;
        const fill = fills?.[key];
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && { backgroundColor: fill ?? theme.text }]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.segmentText,
                { color: selected ? (fill ? '#FFFFFF' : theme.background) : theme.text },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
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
  field: {
    gap: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  segmentText: {
    fontSize: 16,
    fontWeight: '700',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 15,
    fontWeight: '600',
  },
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  inputGroup: {
    gap: 4,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 17,
  },
  hint: {
    fontSize: 13,
    fontWeight: '500',
  },
  previous: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previousText: {
    flex: 1,
    gap: 2,
  },
  previousTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  reopen: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reopenText: {
    fontSize: 15,
    fontWeight: '700',
  },
  start: {
    height: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  startText: {
    fontSize: 18,
    fontWeight: '800',
  },
});
