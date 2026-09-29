/**
 * Group standings, exactly as BWF General Competition Regulations 16.2 rank
 * them.
 *
 *   16.2.1  Matches won.
 *   16.2.2  Two level: the winner of the match between them.
 *   16.2.3  Three or more level: difference of games won and lost, across all
 *           group matches. If that leaves two level: head-to-head.
 *   16.2.4  Still three or more level: difference of points won and lost. If
 *           that leaves two level: head-to-head. Three or more: drawing lots.
 *   16.2.5  A player who cannot complete every group match — illness, injury,
 *           disqualification, or retiring mid-match — has all their results
 *           deleted.
 *
 * Pure and deterministic. Lots are drawn by a person, not by this code: the
 * organiser supplies the order, and until they do, the tie is reported as a
 * tie. The organiser always wins an argument with the algorithm, but the
 * algorithm never invents a result.
 */

export type EntryId = string;

export interface GroupResult {
  a: EntryId;
  b: EntryId;
  winner: EntryId;
  /**
   * Anything but `normal` means the loser did not complete their group, which
   * deletes every result they were part of (16.2.5).
   */
  outcome: 'normal' | 'walkover' | 'retired' | 'disqualified';
  /** Points per game, from `a`'s side first. Empty for a walkover. */
  games: ReadonlyArray<{ a: number; b: number }>;
}

/** The rule that set an entry apart from those level with it. */
export type Criterion = 'matches' | 'headToHead' | 'games' | 'points' | 'lots' | 'tied' | 'withdrawn';

export interface Standing {
  entry: EntryId;
  /** 1-based. Entries still level share a rank. `null` once results are deleted. */
  rank: number | null;
  played: number;
  won: number;
  lost: number;
  gamesWon: number;
  gamesLost: number;
  pointsWon: number;
  pointsLost: number;
  decidedBy: Criterion;
  withdrawn: boolean;
}

interface Tally {
  played: number;
  won: number;
  lost: number;
  gamesWon: number;
  gamesLost: number;
  pointsWon: number;
  pointsLost: number;
}

const empty = (): Tally => ({ played: 0, won: 0, lost: 0, gamesWon: 0, gamesLost: 0, pointsWon: 0, pointsLost: 0 });

type Stage = 'matches' | 'games' | 'points' | 'lots';

/** A run of entries in finishing order. More than one id means they are still level. */
interface Block {
  ids: EntryId[];
  by: Criterion;
}

export function groupStandings(
  entries: readonly EntryId[],
  results: readonly GroupResult[],
  lots: readonly EntryId[] = [],
): Standing[] {
  const withdrawn = new Set(
    results.filter((r) => r.outcome !== 'normal').map((r) => (r.winner === r.a ? r.b : r.a)),
  );
  const counted = results.filter((r) => !withdrawn.has(r.a) && !withdrawn.has(r.b));

  const tally = new Map<EntryId, Tally>(entries.map((id) => [id, empty()]));
  for (const result of counted) record(tally, result);

  const beat = (x: EntryId, y: EntryId): EntryId | null =>
    counted.find((r) => (r.a === x && r.b === y) || (r.a === y && r.b === x))?.winner ?? null;

  const value = (stage: Stage, id: EntryId): number => {
    const t = tally.get(id)!;
    if (stage === 'matches') return t.won;
    if (stage === 'games') return t.gamesWon - t.gamesLost;
    return t.pointsWon - t.pointsLost;
  };

  const headToHead = ([x, y]: EntryId[]): Block[] => {
    const winner = beat(x!, y!);
    // Not yet met: the group is still being played, so the standings are
    // provisional. Lots are for a finished group, never a substitute for a
    // match that has not happened.
    if (!winner) return [{ ids: [x!, y!], by: 'tied' }];
    const loser = winner === x ? y! : x!;
    return [
      { ids: [winner], by: 'headToHead' },
      { ids: [loser], by: 'headToHead' },
    ];
  };

  const byLots = (ids: EntryId[]): Block[] => {
    if (!ids.every((id) => lots.includes(id))) return [{ ids, by: 'tied' }];
    return [...ids].sort((p, q) => lots.indexOf(p) - lots.indexOf(q)).map((id) => ({ ids: [id], by: 'lots' as const }));
  };

  /** `ids` are level on every stage before `stage`. */
  const order = (ids: EntryId[], stage: Stage): Block[] => {
    if (ids.length === 1) return [{ ids, by: stage === 'lots' ? 'lots' : stage }];
    if (ids.length === 2) return headToHead(ids);
    if (stage === 'lots') return byLots(ids);

    const next: Stage = stage === 'matches' ? 'games' : stage === 'games' ? 'points' : 'lots';
    return splitDescending(ids, (id) => value(stage, id)).flatMap((level) =>
      level.length === 1 ? [{ ids: level, by: stage }] : order(level, next),
    );
  };

  const active = entries.filter((id) => !withdrawn.has(id));
  const blocks = order(active, 'matches');

  const standings: Standing[] = [];
  let position = 1;
  for (const block of blocks) {
    for (const id of block.ids) {
      standings.push({ entry: id, rank: position, ...tally.get(id)!, decidedBy: block.by, withdrawn: false });
    }
    position += block.ids.length;
  }

  for (const id of entries.filter((id) => withdrawn.has(id))) {
    standings.push({ entry: id, rank: null, ...empty(), decidedBy: 'withdrawn', withdrawn: true });
  }

  return standings;
}

function record(tally: Map<EntryId, Tally>, result: GroupResult): void {
  const a = tally.get(result.a);
  const b = tally.get(result.b);
  if (!a || !b) return;

  a.played += 1;
  b.played += 1;
  const winnerTally = result.winner === result.a ? a : b;
  const loserTally = winnerTally === a ? b : a;
  winnerTally.won += 1;
  loserTally.lost += 1;

  for (const game of result.games) {
    a.pointsWon += game.a;
    a.pointsLost += game.b;
    b.pointsWon += game.b;
    b.pointsLost += game.a;
    if (game.a > game.b) {
      a.gamesWon += 1;
      b.gamesLost += 1;
    } else {
      b.gamesWon += 1;
      a.gamesLost += 1;
    }
  }
}

/** Groups of equal value, best first. Entry order within a group is kept. */
function splitDescending(ids: EntryId[], value: (id: EntryId) => number): EntryId[][] {
  const levels = [...new Set(ids.map(value))].sort((p, q) => q - p);
  return levels.map((level) => ids.filter((id) => value(id) === level));
}
