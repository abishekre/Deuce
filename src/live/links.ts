/**
 * Where a spectator link points.
 *
 * A blank EXPO_PUBLIC_SITE_URL means unset — .env.example ships it blank — so
 * it has to fall through to the page's own origin. Checking only for null
 * would let the empty string win and quietly make every link vanish.
 */
export function liveLink(slug: string, configured: string | undefined, origin: string | null): string | null {
  const base = configured?.trim() || origin;
  return base ? `${base.replace(/\/+$/, '')}/m/${slug}` : null;
}
