import Storage from 'expo-sqlite/kv-store';

/**
 * Synchronous key-value storage (native). The web build resolves `kv.web.ts`.
 *
 * Synchronous on purpose: the match in progress has to be readable before the
 * first render. A referee whose phone locked mid-game must reopen straight
 * onto the scorer, not flash through an empty setup screen first.
 */
export const kv = {
  get: (key: string): string | null => {
    try {
      return Storage.getItemSync(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string): void => {
    try {
      Storage.setItemSync(key, value);
    } catch {
      // Storage failure must never take down scoring; the in-memory copy
      // survives for this session.
    }
  },
  remove: (key: string): void => {
    try {
      Storage.removeItemSync(key);
    } catch {
      // Nothing to do.
    }
  },
};
