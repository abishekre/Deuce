import {
  gamePoints,
  opponent,
  type GameState,
  type MatchFormat,
  type MatchState,
  type PlayerIndex,
  type Side,
} from '../rules';

import type { Lineup } from './match';

/**
 * Everything the scorer says in words, derived from match state.
 *
 * Kept out of the components because these sentences are what the umpire
 * reads aloud — "Arun serves from the right court to Kiran" — and a wrong name
 * there is a wrong serve on court. Pure, so it is tested like the engine.
 */

export function sideLabel(lineup: Lineup, side: Side): string {
  return lineup[side].join(' & ');
}

function playerName(lineup: Lineup, side: Side, index: PlayerIndex | null): string {
  return lineup[side][index ?? 0] ?? sideLabel(lineup, side);
}

export function scoreOf(game: GameState, side: Side): number {
  return side === 'A' ? game.scoreA : game.scoreB;
}

export function describeFormat(format: MatchFormat): string {
  const games = format.bestOf === 1 ? 'One game' : `Best of ${format.bestOf}`;
  return `${games} to ${format.pointsToWin}`;
}

/**
 * The side the referee sees on the left — the top, in portrait. Swaps every
 * time the players change ends, so the half of the phone always matches the
 * half of the court.
 */
export function sideOnLeft(state: MatchState, startingLeft: Side): Side {
  return state.endsChanged % 2 === 0 ? startingLeft : opponent(startingLeft);
}

/** This side's scores in games no longer on the big numbers, oldest first. */
export function earlierScores(state: MatchState, side: Side): number[] {
  return state.games.slice(0, -1).map((game) => scoreOf(game, side));
}

export type Role = 'serve' | 'receive' | null;

export function roleOf(state: MatchState, side: Side, index: number): Role {
  const { serve } = state;
  if (!serve) return null;
  if (serve.server === side && index === (serve.serverIndex ?? 0)) return 'serve';
  if (serve.receiver === side && index === (serve.receiverIndex ?? 0)) return 'receive';
  return null;
}

export type PointCall = 'game' | 'match' | null;

export function pointCall(state: MatchState, side: Side): PointCall {
  const point = gamePoints(state).find((p) => p.side === side);
  if (!point) return null;
  return point.match ? 'match' : 'game';
}

export interface Call {
  /** A status that outranks the serve: interval, between games, result. */
  headline: string | null;
  serve: string | null;
  tone: 'play' | 'pause' | 'over';
}

function gameLine(game: GameState, from: Side): string {
  return `${scoreOf(game, from)}–${scoreOf(game, opponent(from))}`;
}

export function callFor(state: MatchState, lineup: Lineup): Call {
  const { current } = state;

  if (state.complete && state.winner) {
    const winner = state.winner;
    const verb = lineup[winner].length > 1 ? 'win' : 'wins';
    const scores = state.games.map((game) => gameLine(game, winner)).join(', ');
    return { headline: `${sideLabel(lineup, winner)} ${verb} ${scores}`, serve: null, tone: 'over' };
  }

  if (current.complete && current.winner && state.nextServer) {
    return {
      headline: `Game ${current.index + 1} to ${sideLabel(lineup, current.winner)}, ${gameLine(current, current.winner)}. Change ends.`,
      serve: `${sideLabel(lineup, state.nextServer)} to serve first.`,
      tone: 'pause',
    };
  }

  const serve = state.serve
    ? `${playerName(lineup, state.serve.server, state.serve.serverIndex)} serves from the ${state.serve.court} court to ${playerName(lineup, state.serve.receiver, state.serve.receiverIndex)}`
    : null;

  if (state.atInterval) {
    return { headline: state.changeEnds ? 'Interval. Change ends.' : 'Interval.', serve, tone: 'pause' };
  }

  return { headline: null, serve, tone: 'play' };
}
