import type { EntryId } from './standings';

/**
 * Splitting a category into groups, and ordering each group's matches.
 *
 * Everything here produces a *draft*. The organiser can move any entry to any
 * group afterwards, and what gets stored is their final arrangement, not this
 * output — so nothing downstream may assume groups came from this function.
 */

export interface DrawEntry {
  id: EntryId;
  /** 1 is the strongest. Absent for unseeded entries. */
  seed?: number | null;
}

export class DrawError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawError';
  }
}

/**
 * Deal entries into groups like cards, snaking back at the end of each row:
 * seeds 1–4 go to groups A–D, seeds 5–8 to D–A. Each group gets one of the
 * strongest entries, and the group holding the top seed gets the weakest of
 * the second tier. Unseeded entries are shuffled first — that shuffle is the
 * draw — and dealt on the same pattern, so group sizes differ by at most one.
 *
 * `random` is injected so a draw can be replayed exactly from its seed if it
 * is ever disputed.
 */
export function allocateGroups(entries: readonly DrawEntry[], groupCount: number, random: () => number): EntryId[][] {
  if (!Number.isInteger(groupCount) || groupCount < 1) {
    throw new DrawError(`Need at least one group, got ${groupCount}`);
  }
  if (entries.length < groupCount * 2) {
    throw new DrawError(
      `${entries.length} entries cannot fill ${groupCount} groups — every group needs at least 2`,
    );
  }
  const ids = entries.map((e) => e.id);
  if (new Set(ids).size !== ids.length) throw new DrawError('An entry appears twice');

  const seeded = entries
    .filter((e) => e.seed != null)
    .sort((p, q) => (p.seed as number) - (q.seed as number));
  const unseeded = shuffle(
    entries.filter((e) => e.seed == null),
    random,
  );

  const groups: EntryId[][] = Array.from({ length: groupCount }, () => []);
  [...seeded, ...unseeded].forEach((entry, i) => {
    const row = Math.floor(i / groupCount);
    const column = i % groupCount;
    const group = row % 2 === 0 ? column : groupCount - 1 - column;
    groups[group]!.push(entry.id);
  });

  return groups;
}

/** Fisher–Yates over an injected source, so the same seed always gives the same draw. */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export type Pairing = readonly [EntryId, EntryId];

/**
 * Every pairing in a group, in rounds, by the circle method: one entry stays
 * fixed and the rest rotate. No entry plays twice in a round, so each round is
 * a set of matches that can run side by side on separate courts — the unit a
 * scheduler wants. Odd groups sit one entry out each round.
 */
export function roundRobin(group: readonly EntryId[]): Pairing[][] {
  const players: Array<EntryId | null> = [...group];
  if (players.length % 2 === 1) players.push(null);

  const n = players.length;
  const rounds: Pairing[][] = [];

  for (let round = 0; round < n - 1; round++) {
    const pairings: Pairing[] = [];
    for (let i = 0; i < n / 2; i++) {
      const home = players[i];
      const away = players[n - 1 - i];
      if (home != null && away != null) pairings.push([home, away]);
    }
    rounds.push(pairings);
    // Keep the first player fixed and rotate the rest one step.
    players.splice(1, 0, players.pop()!);
  }

  return rounds;
}
