import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { uuidv7 } from '@/data/ids';
import { kv } from '@/data/kv';
import { appendRally, opponent, undoLastRally, type Side } from '@/rules';

import { createMatch, DEFAULT_INPUT, isDoubleTap, scoreLocal, type LocalMatch, type MatchInput } from './match';

interface ScorerStore {
  match: LocalMatch | null;
  /**
   * The match set aside by the last "New match". Nothing is ever thrown away
   * on one tap: a referee who hits New mid-game gets their score back, which
   * is the undo-over-confirmation trade applied to the whole match.
   */
  previous: LocalMatch | null;
  lastInput: MatchInput;
  /** In memory only — it guards against a double tap, not across restarts. */
  lastRallyAt: number | null;

  start: (input: MatchInput) => void;
  /** Returns whether the rally was recorded. */
  point: (side: Side) => boolean;
  undo: () => void;
  flipView: () => void;
  setAside: () => void;
  restore: () => void;
}

export const useScorer = create<ScorerStore>()(
  persist(
    (set, get) => ({
      match: null,
      previous: null,
      lastInput: DEFAULT_INPUT,
      lastRallyAt: null,

      start: (input) =>
        set({
          match: createMatch(input, uuidv7(), Date.now()),
          previous: null,
          lastInput: input,
          lastRallyAt: null,
        }),

      point: (side) => {
        const { match, lastRallyAt } = get();
        const now = Date.now();
        if (!match || isDoubleTap(lastRallyAt, now) || scoreLocal(match).complete) return false;

        set({ match: { ...match, rallies: appendRally(match.rallies, uuidv7(), side) }, lastRallyAt: now });
        return true;
      },

      undo: () => {
        const { match } = get();
        if (!match) return;
        set({ match: { ...match, rallies: undoLastRally(match.rallies, uuidv7()) }, lastRallyAt: null });
      },

      flipView: () => {
        const { match } = get();
        if (!match) return;
        set({ match: { ...match, startingLeft: opponent(match.startingLeft) } });
      },

      setAside: () => {
        const { match } = get();
        if (!match) return;
        set({ match: null, previous: match, lastRallyAt: null });
      },

      restore: () => {
        const { previous } = get();
        if (!previous) return;
        set({ match: previous, previous: null, lastRallyAt: null });
      },
    }),
    {
      name: 'deuce.scorer.v1',
      version: 1,
      storage: createJSONStorage(() => ({ getItem: kv.get, setItem: kv.set, removeItem: kv.remove })),
      partialize: ({ match, previous, lastInput }) => ({ match, previous, lastInput }),
    },
  ),
);
