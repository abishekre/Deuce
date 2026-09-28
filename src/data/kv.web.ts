/**
 * Synchronous key-value storage (web). See kv.ts for why it is sync.
 *
 * localStorage rather than expo-sqlite's web build, which needs wasm and
 * cross-origin isolation headers — a lot of hosting config to hold a single
 * match.
 */
const memory = new Map<string, string>();

function store(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    // Safari private mode throws on access rather than returning null.
    return null;
  }
}

export const kv = {
  get: (key: string): string | null => {
    try {
      return store()?.getItem(key) ?? memory.get(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  },
  set: (key: string, value: string): void => {
    memory.set(key, value);
    try {
      store()?.setItem(key, value);
    } catch {
      // Quota or blocked storage — the memory copy keeps this tab working.
    }
  },
  remove: (key: string): void => {
    memory.delete(key);
    try {
      store()?.removeItem(key);
    } catch {
      // Nothing to do.
    }
  },
};
