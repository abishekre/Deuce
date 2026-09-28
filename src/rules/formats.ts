import type { Discipline, MatchFormat } from './types';

/**
 * The formats organisers actually run.
 *
 * BWF's 21-point game is the default, but a small tournament that is running
 * two hours late will cut the remaining draws short — so shortening a category
 * has to be a config change, not a code change.
 */

/** Standard BWF: best of three games to 21, win by two, sudden death at 30. */
export const BWF_21 = (discipline: Discipline): MatchFormat => ({
  discipline,
  pointsToWin: 21,
  winBy: 2,
  cap: 30,
  bestOf: 3,
  intervalAt: 11,
});

/** One game to 21. Common for early rounds of an oversubscribed draw. */
export const SINGLE_21 = (discipline: Discipline): MatchFormat => ({
  ...BWF_21(discipline),
  bestOf: 1,
});

/** The pre-2006 scoring length, still used to claw back time. */
export const SHORT_15 = (discipline: Discipline): MatchFormat => ({
  discipline,
  pointsToWin: 15,
  winBy: 2,
  cap: 21,
  bestOf: 3,
  intervalAt: 8,
});

/** BWF's experimental five-by-eleven. The last resort when the hall closes at nine. */
export const SHORT_11 = (discipline: Discipline): MatchFormat => ({
  discipline,
  pointsToWin: 11,
  winBy: 2,
  cap: 15,
  bestOf: 5,
  intervalAt: 6,
});

export const FORMAT_PRESETS = {
  bwf21: { label: 'Best of 3 to 21', build: BWF_21 },
  single21: { label: 'One game to 21', build: SINGLE_21 },
  short15: { label: 'Best of 3 to 15', build: SHORT_15 },
  short11: { label: 'Best of 5 to 11', build: SHORT_11 },
} as const;

export type FormatPresetKey = keyof typeof FORMAT_PRESETS;
