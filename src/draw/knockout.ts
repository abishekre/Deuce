import { DrawError } from './groups';
import type { EntryId } from './standings';

/**
 * Knockout brackets: sizes, seeding, byes, and filling a bracket from a group
 * stage so entries from the same group meet as late as the numbers allow.
 *
 * Positions are 0-indexed from the top of the bracket; `null` is a bye. Like
 * the group draw, every bracket here is a draft the organiser may rearrange.
 */

/** Smallest power of two that holds `count` entries — never less than a final. */
export function bracketSize(count: number): number {
  let size = 2;
  while (size < count) size *= 2;
  return size;
}

/**
 * Seed numbers in bracket order: position `i` holds seed `order[i]`.
 *
 * Seed 1 at the top, 2 at the bottom, and every first-round pair sums to
 * size + 1 — so the top two meet only in the final, the top four no earlier
 * than the semis, and byes, which stand in for the missing lowest seeds, fall
 * against the highest.
 */
export function seedOrder(size: number): number[] {
  if (size < 2 || (size & (size - 1)) !== 0) throw new DrawError(`Bracket size must be a power of two, got ${size}`);

  let order = [1, 2];
  while (order.length < size) {
    const next = order.length * 2;
    order = order.flatMap((seed, i) => (i % 2 === 0 ? [seed, next + 1 - seed] : [next + 1 - seed, seed]));
  }
  return order;
}

/** The round in which two positions could first meet: 1 is the first round. */
export function meetingRound(p: number, q: number): number {
  return 32 - Math.clz32(p ^ q);
}

/** A pure knockout: entries strongest first, byes to the top seeds. */
export function seededPositions(entries: readonly EntryId[]): Array<EntryId | null> {
  const order = seedOrder(bracketSize(entries.length));
  return order.map((seed) => entries[seed - 1] ?? null);
}

export interface Qualifier {
  entry: EntryId;
  /** Which group they came from. */
  group: number;
  /** Where they finished in it: 1 for the winner. */
  place: number;
}

/**
 * Fill a knockout bracket from a group stage.
 *
 * Group winners are seeded in group order. Everyone else is placed, best
 * finishers first, in the free position furthest from their own group's
 * entries already in the bracket — which puts each group's top two in
 * opposite halves, so they can only meet again in the final. Byes stand in
 * for the missing lowest seeds and so go against group winners.
 */
export function knockoutFromGroups(qualifiers: readonly Qualifier[]): Array<EntryId | null> {
  if (qualifiers.length < 2) throw new DrawError('A knockout needs at least two qualifiers');

  const size = bracketSize(qualifiers.length);
  const order = seedOrder(size);
  const positionOfSeed = (seed: number) => order.indexOf(seed);

  const winners = qualifiers.filter((q) => q.place === 1).sort((p, q) => p.group - q.group);
  const others = qualifiers
    .filter((q) => q.place !== 1)
    .sort((p, q) => p.place - q.place || p.group - q.group);

  const positions: Array<EntryId | null> = Array.from({ length: size }, () => null);
  const placed: Array<{ group: number; position: number }> = [];

  winners.forEach((winner, i) => {
    const position = positionOfSeed(i + 1);
    positions[position] = winner.entry;
    placed.push({ group: winner.group, position });
  });

  // Seeds beyond the qualifier count are byes; everything between the
  // winners and the byes is open, strongest slot first.
  const open = Array.from({ length: qualifiers.length - winners.length }, (_, i) =>
    positionOfSeed(winners.length + i + 1),
  );

  for (const qualifier of others) {
    const own = placed.filter((p) => p.group === qualifier.group).map((p) => p.position);
    const distance = (position: number) =>
      own.length === 0 ? Infinity : Math.min(...own.map((mine) => meetingRound(position, mine)));

    // The furthest open slot from their own group; ties go to the stronger slot.
    let best = 0;
    for (let i = 1; i < open.length; i++) {
      if (distance(open[i]!) > distance(open[best]!)) best = i;
    }

    const [position] = open.splice(best, 1);
    positions[position!] = qualifier.entry;
    placed.push({ group: qualifier.group, position: position! });
  }

  return positions;
}

export type Slot =
  | { kind: 'entry'; entry: EntryId }
  | { kind: 'bye' }
  | { kind: 'winner'; round: number; index: number };

export interface BracketMatch {
  /** 1 is the first round; the last round is the final. */
  round: number;
  index: number;
  a: Slot;
  b: Slot;
}

/** The whole bracket as matches, round by round, each later match fed by two earlier ones. */
export function bracketMatches(positions: ReadonlyArray<EntryId | null>): BracketMatch[][] {
  const size = positions.length;
  if (size < 2 || (size & (size - 1)) !== 0) throw new DrawError('Positions must fill a power-of-two bracket');

  const slot = (entry: EntryId | null): Slot => (entry === null ? { kind: 'bye' } : { kind: 'entry', entry });
  const rounds: BracketMatch[][] = [];

  rounds.push(
    Array.from({ length: size / 2 }, (_, index) => ({
      round: 1,
      index,
      a: slot(positions[index * 2] ?? null),
      b: slot(positions[index * 2 + 1] ?? null),
    })),
  );

  for (let round = 2; 2 ** round <= size; round++) {
    const previous = rounds[round - 2]!;
    rounds.push(
      Array.from({ length: previous.length / 2 }, (_, index) => ({
        round,
        index,
        a: { kind: 'winner', round: round - 1, index: index * 2 },
        b: { kind: 'winner', round: round - 1, index: index * 2 + 1 },
      })),
    );
  }

  return rounds;
}

export const matchKey = (round: number, index: number): string => `${round}:${index}`;

export interface ResolvedMatch {
  round: number;
  index: number;
  /** `null` is a bye; `undefined` means the feeding match has not finished. */
  a: EntryId | null | undefined;
  b: EntryId | null | undefined;
  winner: EntryId | undefined;
  /** Won by facing a bye rather than by playing. */
  bye: boolean;
}

/**
 * Who is actually in each match, given the winners recorded so far. A bye
 * advances its opponent without a match being played.
 */
export function resolveBracket(
  rounds: readonly BracketMatch[][],
  winners: ReadonlyMap<string, EntryId>,
): ResolvedMatch[][] {
  const resolved: ResolvedMatch[][] = [];

  const entrant = (slot: Slot): EntryId | null | undefined => {
    if (slot.kind === 'entry') return slot.entry;
    if (slot.kind === 'bye') return null;
    return resolved[slot.round - 1]?.[slot.index]?.winner;
  };

  for (const round of rounds) {
    resolved.push(
      round.map((match) => {
        const a = entrant(match.a);
        const b = entrant(match.b);
        const bye = (a === null && b != null) || (b === null && a != null);
        let winner = bye ? (a ?? b ?? undefined) : winners.get(matchKey(match.round, match.index));

        if (winner !== undefined && !bye && winner !== a && winner !== b) {
          throw new DrawError(
            `Round ${match.round} match ${match.index + 1} records a winner who is not in it`,
          );
        }
        if (a === undefined || b === undefined) winner = undefined;

        return { round: match.round, index: match.index, a, b, winner: winner ?? undefined, bye };
      }),
    );
  }

  return resolved;
}
