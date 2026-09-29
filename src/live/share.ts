import { Platform, Share } from 'react-native';

import { liveLink } from './links';

/**
 * The spectator link. Native builds need EXPO_PUBLIC_SITE_URL, because a phone
 * app has no origin of its own to point people at; the web build falls back
 * to wherever it is being served from.
 */
export function liveUrl(slug: string): string | null {
  const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : null;
  return liveLink(slug, process.env.EXPO_PUBLIC_SITE_URL, origin);
}

export type ShareResult = 'shared' | 'copied' | 'unavailable';

export async function shareLiveLink(slug: string, title: string): Promise<ShareResult> {
  const url = liveUrl(slug);
  if (!url) return 'unavailable';

  if (Platform.OS !== 'web') {
    await Share.share({ message: `${title} — live score: ${url}`, url });
    return 'shared';
  }

  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav?.share) {
    try {
      await nav.share({ title, url });
      return 'shared';
    } catch (error) {
      // Dismissing the sheet is a choice, not a failure.
      if (error instanceof Error && error.name === 'AbortError') return 'shared';
    }
  }

  try {
    await nav?.clipboard.writeText(url);
    return nav?.clipboard ? 'copied' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
