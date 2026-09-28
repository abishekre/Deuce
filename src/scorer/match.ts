import {
  FORMAT_PRESETS,
  scoreMatch,
  type Discipline,
  type FormatPresetKey,
  type MatchFormat,
  type MatchState,
  type Rally,
  type Side,
} from '../rules';

/**
 * A match scored on this device, before any of it touches a server.
 *
 * Pure on purpose — no React, no storage — so it runs under the same bare-Node
 * tests as the rules engine. The store and the screens are thin shells around
 * these functions.
 */

/** What the referee fills in before the first serve. Kept so the next match starts prefilled. */
export interface MatchInput {
  discipline: Discipline;
  preset: FormatPresetKey;
  /** Ignored past the first name in singles. In doubles, the first-listed player starts in the right court. */
  names: Record<Side, [string, string]>;
  firstServer: Side;
}

/** Player names per side, indexed the same way as the engine's `PlayerIndex`. */
export type Lineup = Record<Side, readonly string[]>;

/**
 * Inputs and the rally log — nothing else. The score is never stored; it is
 * folded from `rallies` every time it is needed.
 */
export interface LocalMatch {
  id: string;
  startedAt: number;
  format: MatchFormat;
  lineup: Lineup;
  firstServer: Side;
  /**
   * Which side the referee sees on the left (the top, in portrait) at the
   * first serve. A view preference, not match data: it only records how the
   * phone is being held against the court.
   */
  startingLeft: Side;
  rallies: Rally[];
}

export const DEFAULT_INPUT: MatchInput = {
  discipline: 'doubles',
  preset: 'bwf21',
  names: { A: ['', ''], B: ['', ''] },
  firstServer: 'A',
};

/** Blank names fall back to numbered players, so Start works with no typing at all. */
export function lineupFrom(input: MatchInput): Lineup {
  const perSide = input.discipline === 'doubles' ? 2 : 1;
  const fill = (side: Side, offset: number) =>
    input.names[side].slice(0, perSide).map((name, i) => name.trim() || `Player ${offset + i + 1}`);

  return { A: fill('A', 0), B: fill('B', perSide) };
}

export function createMatch(input: MatchInput, id: string, now: number): LocalMatch {
  return {
    id,
    startedAt: now,
    format: FORMAT_PRESETS[input.preset].build(input.discipline),
    lineup: lineupFrom(input),
    firstServer: input.firstServer,
    startingLeft: 'A',
    rallies: [],
  };
}

export function scoreLocal(match: LocalMatch): MatchState {
  return scoreMatch(match.format, match.rallies, {
    firstServer: match.firstServer,
    // Names are entered right court first, so player 0 always starts on the right.
    startingRight: { A: 0, B: 0 },
  });
}

/** The rally an undo would void, so the button can say whose point it takes back. */
export function lastLiveRally(rallies: readonly Rally[]): Rally | null {
  let last: Rally | null = null;
  for (const rally of rallies) {
    if (!rally.voidedBy && (last === null || rally.seq > last.seq)) last = rally;
  }
  return last;
}

/**
 * Minimum gap between two recorded rallies.
 *
 * No real rally, plus the referee's reaction, is shorter than about a second,
 * and a nervous double tap lands well inside this — so anything faster is the
 * same tap twice. Undo clears it, so a wrong tap followed at once by the right
 * one always goes through.
 */
export const DOUBLE_TAP_MS = 400;

export function isDoubleTap(lastRallyAt: number | null, now: number): boolean {
  return lastRallyAt !== null && now - lastRallyAt < DOUBLE_TAP_MS;
}
