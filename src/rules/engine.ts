import {
  opponent,
  SIDES,
  type GamePoint,
  type GameState,
  type MatchFormat,
  type MatchState,
  type PlayerIndex,
  type Rally,
  type ServeState,
  type ServiceCourt,
  type Side,
} from './types';

export class RulesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RulesError';
  }
}

export interface MatchSetup {
  /** Side serving the opening rally of game 1 — won by the toss. */
  firstServer: Side;
  /**
   * Doubles only. Which player of each pair starts a game in the right service
   * court.
   *
   * BWF lets a pair re-choose at the start of every game, so this resets each
   * game rather than carrying the end-of-game arrangement forward. A referee UI
   * that wants to record the real choice will need this per game; until then,
   * resetting is at least deterministic and documented.
   */
  startingRight: Record<Side, PlayerIndex>;
}

const DEFAULT_SETUP: MatchSetup = {
  firstServer: 'A',
  startingRight: { A: 0, B: 0 },
};

/**
 * Formats come from organiser input, so they are validated rather than trusted.
 * "Points to 21, cap 15" is a plausible typo and should produce a clear error,
 * not a match that can never end.
 */
export function validateFormat(format: MatchFormat): void {
  const { pointsToWin, winBy, cap, bestOf, intervalAt } = format;

  if (!Number.isInteger(pointsToWin) || pointsToWin < 1) {
    throw new RulesError(`pointsToWin must be a positive integer, got ${pointsToWin}`);
  }
  if (!Number.isInteger(winBy) || winBy < 1) {
    throw new RulesError(`winBy must be a positive integer, got ${winBy}`);
  }
  if (cap !== null && (!Number.isInteger(cap) || cap < pointsToWin)) {
    throw new RulesError(`cap must be null or an integer at least pointsToWin (${pointsToWin}), got ${cap}`);
  }
  if (!Number.isInteger(bestOf) || bestOf < 1 || bestOf % 2 === 0) {
    throw new RulesError(`bestOf must be a positive odd integer, got ${bestOf}`);
  }
  if (intervalAt !== null && (!Number.isInteger(intervalAt) || intervalAt < 1 || intervalAt >= pointsToWin)) {
    throw new RulesError(
      `intervalAt must be null or an integer between 1 and pointsToWin - 1 (${pointsToWin - 1}), got ${intervalAt}`,
    );
  }
}

/** Games one side must win to take the match. */
export function gamesToWin(format: MatchFormat): number {
  return Math.ceil(format.bestOf / 2);
}

function isGameComplete(hi: number, lo: number, format: MatchFormat): boolean {
  if (format.cap !== null && hi >= format.cap) return true;
  return hi >= format.pointsToWin && hi - lo >= format.winBy;
}

/** The last game the match could possibly go to. Ends change mid-way through it. */
function isDecider(gameIndex: number, format: MatchFormat): boolean {
  return gameIndex === format.bestOf - 1;
}

/** Mutable fold accumulator for a single game. Frozen into a `GameState` on exit. */
interface Working {
  index: number;
  scoreA: number;
  scoreB: number;
  complete: boolean;
  winner: Side | null;
  server: Side;
  rightCourt: Record<Side, PlayerIndex>;
  /** Seq of the rally that triggered the interval, so "we are at it" is an exact moment. */
  intervalSeq: number | null;
}

function startGame(index: number, server: Side, startingRight: Record<Side, PlayerIndex>): Working {
  return {
    index,
    scoreA: 0,
    scoreB: 0,
    complete: false,
    winner: null,
    server,
    rightCourt: { ...startingRight },
    intervalSeq: null,
  };
}

function freeze(w: Working): GameState {
  return {
    index: w.index,
    scoreA: w.scoreA,
    scoreB: w.scoreB,
    complete: w.complete,
    winner: w.winner,
  };
}

/**
 * The whole of badminton's rally-point rules, in one transition.
 *
 * Serving side wins: they score, the same player serves again, and the pair
 * swap courts — which is why the server's score parity alone determines the
 * service court. Receiving side wins: they score and take the serve, but do
 * *not* swap; whichever partner is already standing in the correct court
 * serves. That asymmetry is the rule most scoring apps get wrong.
 */
function applyRally(w: Working, format: MatchFormat, winner: Side, seq: number): void {
  const servingSideWon = winner === w.server;

  if (winner === 'A') w.scoreA += 1;
  else w.scoreB += 1;

  if (servingSideWon) {
    if (format.discipline === 'doubles') {
      w.rightCourt[winner] = (1 - w.rightCourt[winner]) as PlayerIndex;
    }
  } else {
    w.server = winner;
  }

  const hi = Math.max(w.scoreA, w.scoreB);
  const lo = Math.min(w.scoreA, w.scoreB);

  if (format.intervalAt !== null && w.intervalSeq === null && hi === format.intervalAt) {
    w.intervalSeq = seq;
  }

  if (isGameComplete(hi, lo, format)) {
    w.complete = true;
    w.winner = w.scoreA > w.scoreB ? 'A' : 'B';
  }
}

function deriveServe(w: Working, format: MatchFormat): ServeState {
  const serverScore = w.server === 'A' ? w.scoreA : w.scoreB;
  const court: ServiceCourt = serverScore % 2 === 0 ? 'right' : 'left';
  const receiver = opponent(w.server);

  if (format.discipline === 'singles') {
    return { server: w.server, receiver, court, serverIndex: null, receiverIndex: null, rightCourt: null };
  }

  // Right serves diagonally to right, left to left, so both ends read the same label.
  const inCourt = (side: Side): PlayerIndex =>
    court === 'right' ? w.rightCourt[side] : ((1 - w.rightCourt[side]) as PlayerIndex);

  return {
    server: w.server,
    receiver,
    court,
    serverIndex: inCourt(w.server),
    receiverIndex: inCourt(receiver),
    rightCourt: { ...w.rightCourt },
  };
}

/**
 * Fold a rally log into the full state of a match.
 *
 * This is the only way a score is ever produced. Nothing stores one.
 */
export function scoreMatch(
  format: MatchFormat,
  rallies: readonly Rally[],
  setup: Partial<MatchSetup> = {},
): MatchState {
  validateFormat(format);

  const { firstServer, startingRight } = { ...DEFAULT_SETUP, ...setup };
  const needed = gamesToWin(format);

  const live = rallies
    .filter((r) => !r.voidedBy)
    .slice()
    .sort((a, b) => a.seq - b.seq);

  const completed: GameState[] = [];
  const gamesWon: Record<Side, number> = { A: 0, B: 0 };
  const surplusRallyIds: string[] = [];

  let w = startGame(0, firstServer, startingRight);
  let matchComplete = false;
  let matchWinner: Side | null = null;
  let applied = 0;
  let lastSeq: number | null = null;

  for (const rally of live) {
    if (matchComplete) {
      surplusRallyIds.push(rally.id);
      continue;
    }

    // A completed game stays current until the next rally arrives, so the state
    // between games is representable — that break is where ends are changed.
    if (w.complete) {
      completed.push(freeze(w));
      w = startGame(w.index + 1, w.winner as Side, startingRight);
    }

    applyRally(w, format, rally.winner, rally.seq);
    applied += 1;
    lastSeq = rally.seq;

    if (w.complete) {
      const gameWinner = w.winner as Side;
      gamesWon[gameWinner] += 1;
      if (gamesWon[gameWinner] >= needed) {
        matchComplete = true;
        matchWinner = gameWinner;
      }
    }
  }

  const games = [...completed, freeze(w)];
  const atInterval = !w.complete && lastSeq !== null && w.intervalSeq === lastSeq;
  const changeEnds =
    lastSeq !== null &&
    !matchComplete &&
    (w.complete || (isDecider(w.index, format) && w.intervalSeq === lastSeq));

  return {
    format,
    games,
    current: games[games.length - 1] as GameState,
    gamesWon,
    serve: matchComplete || w.complete ? null : deriveServe(w, format),
    nextServer: !matchComplete && w.complete ? w.winner : null,
    complete: matchComplete,
    winner: matchWinner,
    rallyCount: applied,
    atInterval,
    changeEnds,
    endsChanged: countEndChanges(games, format, matchComplete),
    surplusRallyIds,
  };
}

/**
 * Ends change after every game but the last, and once more when the leading
 * score reaches the interval in the deciding game. Counted from the games
 * rather than tracked through the fold, so it cannot drift from them.
 */
function countEndChanges(games: readonly GameState[], format: MatchFormat, matchComplete: boolean): number {
  const finished = games.filter((g) => g.complete).length;
  const afterGames = matchComplete ? finished - 1 : finished;

  const decider = games[format.bestOf - 1];
  const deciderTurned =
    decider !== undefined &&
    format.intervalAt !== null &&
    Math.max(decider.scoreA, decider.scoreB) >= format.intervalAt;

  return afterGames + (deciderTurned ? 1 : 0);
}

/**
 * Sides one rally away from winning the current game — what the umpire calls
 * as "game point" or "match point".
 *
 * Both sides can be there at once: at 29-all under a 30 cap, the next rally
 * wins the game for whoever takes it, and in a match level on games one of
 * them may be playing for the match while the other only plays for the game.
 */
export function gamePoints(state: MatchState): GamePoint[] {
  const { format, current, gamesWon } = state;
  if (state.complete || current.complete) return [];

  const needed = gamesToWin(format);

  return SIDES.flatMap((side) => {
    const mine = (side === 'A' ? current.scoreA : current.scoreB) + 1;
    const theirs = side === 'A' ? current.scoreB : current.scoreA;
    if (mine <= theirs || !isGameComplete(mine, theirs, format)) return [];
    return [{ side, match: gamesWon[side] + 1 >= needed }];
  });
}

/**
 * Append a rally to a log. The caller owns id generation — ids come from the
 * device so the write survives a round trip through the outbox.
 */
export function appendRally(rallies: readonly Rally[], id: string, winner: Side): Rally[] {
  const nextSeq = rallies.reduce((max, r) => Math.max(max, r.seq), -1) + 1;
  return [...rallies, { id, seq: nextSeq, winner }];
}

/**
 * Undo the most recent live rally by tombstoning it.
 *
 * Voiding rather than deleting keeps the referee's mistake in the record, which
 * is what a disputed result needs. Returns the log unchanged when there is
 * nothing left to undo.
 */
export function undoLastRally(rallies: readonly Rally[], voidedBy: string): Rally[] {
  let targetIndex = -1;
  let targetSeq = -Infinity;

  rallies.forEach((rally, index) => {
    if (!rally.voidedBy && rally.seq > targetSeq) {
      targetSeq = rally.seq;
      targetIndex = index;
    }
  });

  if (targetIndex === -1) return [...rallies];

  return rallies.map((rally, index) => (index === targetIndex ? { ...rally, voidedBy } : rally));
}
