import { kv } from './kv';

/**
 * Where the signed-in session lives on a phone. The web build resolves
 * `authStorage.web.ts` and keeps supabase-js's own localStorage default.
 *
 * The same synchronous store as the match in progress, so a referee who opens
 * the app with no signal is still signed in.
 */
export const authStorage = {
  getItem: (key: string) => kv.get(key),
  setItem: (key: string, value: string) => kv.set(key, value),
  removeItem: (key: string) => kv.remove(key),
};
