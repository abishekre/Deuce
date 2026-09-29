import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Theme } from '@/design/theme';

/**
 * The link, on screen, as selectable text — the fallback that always works.
 *
 * Share sheets and clipboard writes both need a secure context. A dev build
 * opened over plain http on the club's wifi has neither, and neither do some
 * in-app browsers; without this, the referee would be told "can't share" and
 * left with no way to get the link out at all.
 */
export function LinkSheet({
  slug,
  url,
  onClose,
  theme,
}: {
  slug: string;
  url: string | null;
  onClose: () => void;
  theme: Theme;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        {/* Swallows taps so pressing the card does not close it. */}
        <Pressable style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.line }]} onPress={() => {}}>
          <Text style={[styles.label, { color: theme.muted }]}>Live score link</Text>
          {url ? (
            <Text selectable style={[styles.url, { color: theme.text }]}>
              {url}
            </Text>
          ) : null}

          <View style={styles.codeRow}>
            <Text style={[styles.label, { color: theme.muted }]}>Code</Text>
            <Text selectable style={[styles.code, { color: theme.text }]}>
              {`${slug.slice(0, 5)} ${slug.slice(5)}`}
            </Text>
          </View>

          <Text style={[styles.hint, { color: theme.muted }]}>
            {url
              ? "This browser can't open a share sheet or copy on its own. Select the link above to copy it."
              : 'This build has no site address set, so there is no link to share yet.'}
          </Text>

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={({ pressed }) => [styles.done, { backgroundColor: theme.text, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.doneText, { color: theme.background }]}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 22,
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  url: {
    fontSize: 17,
    fontWeight: '600',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  code: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
  },
  done: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  doneText: {
    fontSize: 17,
    fontWeight: '800',
  },
});
