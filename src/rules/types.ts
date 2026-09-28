/**
 * Badminton scoring types.
 *
 * Everything in `src/rules` is plain data and pure functions — no React, no
 * Supabase, no I/O — so the engine runs under bare Node in the tests and inside
 * the referee app unchanged. The score is the one part of a tournament that is
 * never allowed to be wrong, and isolation is what makes it cheap to test
 * exhaustively.
 */

/**
 * Which half of the court a side occupies. Stable for the whole match: players
 * change ends at intervals, but side identity does not follow them across.
 */
export type Side = 'A' | 'B';

export const SIDES: readonly Side[] = ['A', 'B'];

export const opponent = (side: Side): Side => (side === 'A' ? 'B' : 'A');

/**
 * Service courts. Which one is in use follows from the server's score parity,
 * so it is only ever derived — never recorded.
 */
export type ServiceCourt = 'right' | 'left';

export type Discipline = 'singles' | 'doubles';

/** Index of a player within their own side. Doubles has two, singles has one. */
export type PlayerIndex = 0 | 1;

/**
 * Everything that varies between the formats an organiser might run.
 *
 * Small tournaments cut games short to finish before the hall closes, so this
 * is configurable from the first commit. Hard-coding 21×3 buys a rewrite at
 * 4pm on finals day.
 */
export interface MatchFormat {
  discipline: Discipline;
  /** Points needed to win a game outright. 21 under BWF; 15 and 11 are common short formats. */
  pointsToWin: number;
  /** Margin required to win at or above `pointsToWin`. */
  winBy: number;
  /** Ceiling where `winBy` stops applying — the first to reach it wins. `null` plays on forever. */
  cap: number | null;
  /** Games in the match. First to `ceil(bestOf / 2)` takes it. */
  bestOf: number;
  /** Leading score that triggers the mid-game interval. `null` disables it. */
  intervalAt: number | null;
}

/**
 * One rally, as written by the referee device.
 *
 * `id` is client-generated so an offline write can be replayed idempotently.
 * Undo tombstones via `voidedBy` rather than deleting, because a disputed
 * result needs an audit trail more than the table needs to be tidy.
 */
export interface Rally {
  id: string;
  /** Monotonic within a match. Ordering, not game position — the fold derives games. */
  seq: number;
  winner: Side;
  voidedBy?: string | null;
}

export interface GameState {
  /** 0-based. */
  index: number;
  scoreA: number;
  scoreB: number;
  complete: boolean;
  winner: Side | null;
}

export interface ServeState {
  server: Side;
  receiver: Side;
  /** Court the serve is delivered from — and, mirrored, received in. */
  court: ServiceCourt;
  /** Doubles only. Which player of the serving side is on strike. */
  serverIndex: PlayerIndex | null;
  /** Doubles only. Their diagonal opposite. */
  receiverIndex: PlayerIndex | null;
  /**
   * Doubles only. Which player of each side currently stands in their right
   * service court; the other is necessarily in the left. Storing one index per
   * side rather than a pair of positions makes an invalid arrangement
   * unrepresentable.
   */
  rightCourt: Record<Side, PlayerIndex> | null;
}

export interface MatchState {
  format: MatchFormat;
  /** Every game reached, including the one in progress. Never empty. */
  games: readonly GameState[];
  /** The game in progress, or the final game once the match is complete. */
  current: GameState;
  gamesWon: Record<Side, number>;
  /** Live serve, or `null` during a between-games break and after match point. */
  serve: ServeState | null;
  /** Who serves the next game, during a break. `null` otherwise. */
  nextServer: Side | null;
  complete: boolean;
  winner: Side | null;
  /** Rallies actually applied — voided ones and surplus excluded. */
  rallyCount: number;
  /** The rally just applied triggered the mid-game interval. */
  atInterval: boolean;
  /** Players should change ends now. */
  changeEnds: boolean;
  /**
   * Rallies recorded after match point, which the fold refused to apply.
   *
   * Two devices briefly scoring the same match is a real offline failure mode.
   * Throwing would make the whole match unreadable, so the engine reports the
   * surplus instead and lets the UI ask a human about it.
   */
  surplusRallyIds: readonly string[];
}
