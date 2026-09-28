import * as Haptics from 'expo-haptics';

/**
 * A tap the referee can feel without looking down from the court.
 *
 * Haptics are a courtesy: a browser without the Vibration API, or a phone with
 * it switched off, must never take scoring down with it.
 */
export function feel(kind: 'point' | 'game' | 'undo'): void {
  try {
    const pending =
      kind === 'game'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        : kind === 'undo'
          ? Haptics.selectionAsync()
          : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    pending.catch(() => {});
  } catch {
    // Unsupported here; the screen already shows the change.
  }
}
