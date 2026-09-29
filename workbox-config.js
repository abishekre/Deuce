/**
 * The offline shell for the web build, generated after `expo export`.
 *
 * Precaches the exported app so that once a phone has loaded Deuce, it opens
 * again with no signal — and a referee who reloads mid-match in a basement
 * gets the scorer back, with the match still in local storage.
 *
 * Only the app itself is cached. Supabase calls are cross-origin and never
 * touched, so the score a spectator sees is always the server's, never a
 * cached copy of an old one.
 */
module.exports = {
  globDirectory: 'dist/',
  globPatterns: ['**/*.{html,js,css,json,svg,png,ico,ttf,woff,woff2}'],
  // Workbox skips node_modules by default. In an Expo export that path holds
  // only expo-router's own images — error, sitemap and header icons — and
  // leaving them out would show blank icons offline the day a header is added.
  // So the only thing left out is the service worker's own code.
  globIgnores: ['sw.js', 'workbox-*.js'],
  swDest: 'dist/sw.js',

  // Every route is the single-page app. /score and /m/<code> must open
  // offline just as / does.
  navigateFallback: '/index.html',

  // Expo puts a content hash in its bundle and asset filenames, so those
  // URLs version themselves and need no cache-busting query.
  dontCacheBustURLsMatching: /[.-][0-9a-f]{20,}\./,

  // A new deploy takes over on the next load instead of waiting for every
  // tab to close. Safe here: the export is one bundle, with no lazy chunks
  // an old page could still ask for.
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,

  // The bundle is about 1.5 MB raw and growing; workbox's 2 MiB default
  // would silently drop it from the cache one release from now.
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
};
