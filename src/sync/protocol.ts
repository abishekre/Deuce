import type { MatchFormat, Rally, Side } from '../rules';
import type { Lineup, LocalMatch } from '../scorer/match';

/**
 * The wire format between the referee's device, the server and spectators.
 *
 * Pure, like the engine, so the parts that decide what gets sent and what a
 * spectator will believe are tested under bare Node.
 *
 * Sync is state-based rather than a queue of operations: the device pushes
 * whatever the server does not yet have, and the server's upsert is
 * idempotent. A retry after an uncertain failure therefore resends, and a
 * resend changes nothing — no outbox to corrupt, no operation to apply twice.
 */

/** Rally id → whether the server holds it voided. What this device knows the server has. */
export type Acked = ReadonlyMap<string, boolean>;

/** Rallies the server has not seen in their current state: new ones, and newly voided ones. */
export function pendingRallies(rallies: readonly Rally[], acked: Acked): Rally[] {
  return rallies
    .filter((rally) => acked.get(rally.id) !== Boolean(rally.voidedBy))
    .sort((a, b) => a.seq - b.seq);
}

export function acknowledge(acked: Acked, pushed: readonly Rally[]): Map<string, boolean> {
  const next = new Map(acked);
  for (const rally of pushed) next.set(rally.id, Boolean(rally.voidedBy));
  return next;
}

/** Rallies per call — well under the server's limit of 500, and more than a whole match. */
export const SYNC_BATCH = 200;

export interface MatchPayload {
  id: string;
  slug: string;
  format: MatchFormat;
  lineup: Lineup;
  firstServer: Side;
  startedAt: number;
}

/**
 * Built field by field rather than spread from the match, so the referee
 * token — which travels as its own argument — can never ride along into a
 * payload by accident.
 */
export function matchPayload(match: LocalMatch): MatchPayload {
  return {
    id: match.id,
    slug: match.slug,
    format: match.format,
    lineup: match.lineup,
    firstServer: match.firstServer,
    startedAt: match.startedAt,
  };
}

export interface RallyPayload {
  id: string;
  seq: number;
  winner: Side;
  voidedBy: string | null;
}

export function rallyPayload(rally: Rally): RallyPayload {
  return { id: rally.id, seq: rally.seq, winner: rally.winner, voidedBy: rally.voidedBy ?? null };
}

/** What a spectator's link resolves to. */
export interface LiveMatch {
  slug: string;
  format: MatchFormat;
  lineup: Lineup;
  firstServer: Side;
  startedAt: number;
  rallies: Rally[];
}

export const SLUG_PATTERN = /^[A-HJ-NP-Z2-9]{10}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSide = (value: unknown): value is Side => value === 'A' || value === 'B';

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

function isFormat(value: unknown): value is MatchFormat {
  return (
    isRecord(value) &&
    (value.discipline === 'singles' || value.discipline === 'doubles') &&
    isCount(value.pointsToWin) &&
    isCount(value.winBy) &&
    isCount(value.bestOf) &&
    (value.cap === null || isCount(value.cap)) &&
    (value.intervalAt === null || isCount(value.intervalAt))
  );
}

function isLineup(value: unknown): value is Lineup {
  const side = (names: unknown) =>
    Array.isArray(names) &&
    names.length >= 1 &&
    names.length <= 2 &&
    names.every((name) => typeof name === 'string' && name.length > 0 && name.length <= 60);
  return isRecord(value) && side(value.A) && side(value.B);
}

/**
 * Any referee can write a match, so a spectator's browser treats the payload
 * as untrusted: anything malformed comes back as null and the page says so,
 * rather than failing halfway through a fold. Format values — a cap below the
 * target, say — are left for the engine's own validation to reject.
 */
export function parseLiveMatch(value: unknown): LiveMatch | null {
  if (!isRecord(value)) return null;

  const { slug, format, lineup, firstServer, startedAt, rallies } = value;
  if (
    typeof slug !== 'string' ||
    !isFormat(format) ||
    !isLineup(lineup) ||
    !isSide(firstServer) ||
    typeof startedAt !== 'number' ||
    !Array.isArray(rallies)
  ) {
    return null;
  }

  const parsed: Rally[] = [];
  for (const rally of rallies) {
    if (!isRecord(rally) || typeof rally.id !== 'string' || !isCount(rally.seq) || !isSide(rally.winner)) {
      return null;
    }
    parsed.push({
      id: rally.id,
      seq: rally.seq,
      winner: rally.winner,
      voidedBy: typeof rally.voidedBy === 'string' ? rally.voidedBy : null,
    });
  }

  return { slug, format, lineup, firstServer, startedAt, rallies: parsed };
}

export type SyncStatus =
  /** No backend in this build. Scoring works; there is simply no link to share. */
  | { kind: 'local' }
  /** The match has not reached the server yet; the first attempt is under way. */
  | { kind: 'starting' }
  | { kind: 'live'; pending: number }
  /** The last attempt failed — usually no signal — and is being retried. */
  | { kind: 'waiting'; pending: number; created: boolean }
  /** The server refused for good: this device's token, or the data, is wrong. Retrying cannot help. */
  | { kind: 'rejected' };

export interface SyncLabel {
  tone: 'good' | 'warn' | 'bad';
  text: string;
}

/**
 * What the referee sees in the corner. Quiet when things are fine — a label
 * that flickered to "Sending" on every tap would be noise — and specific when
 * they are not, because "4 unsent" is what tells a referee that their phone,
 * not the app, has lost signal.
 */
export function describeSync(status: SyncStatus): SyncLabel | null {
  switch (status.kind) {
    case 'local':
      return null;
    case 'starting':
      return { tone: 'warn', text: 'Going live' };
    case 'live':
      return { tone: 'good', text: status.pending > 2 ? `Sending ${status.pending}` : 'Live' };
    case 'waiting':
      return { tone: 'warn', text: status.created ? `${status.pending} unsent` : 'Not live yet' };
    case 'rejected':
      return { tone: 'bad', text: 'Not live' };
  }
}
