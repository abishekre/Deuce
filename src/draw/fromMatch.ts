import type { MatchState } from '../rules';

import type { EntryId, GroupResult } from './standings';

/**
 * A finished match, as the standings need it. The game scores come straight
 * from the same fold the referee's phone runs, so a table can never disagree
 * with the scoreboard it was built from.
 *
 * Returns null for a match still in play — an unfinished match is not a
 * result, and counting its games so far would move the table mid-rally.
 */
export function groupResultFrom(a: EntryId, b: EntryId, state: MatchState): GroupResult | null {
  if (!state.complete || !state.winner) return null;

  return {
    a,
    b,
    winner: state.winner === 'A' ? a : b,
    outcome: 'normal',
    games: state.games.map((game) => ({ a: game.scoreA, b: game.scoreB })),
  };
}
