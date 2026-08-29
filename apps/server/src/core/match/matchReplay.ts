import { GamePhase, SeededRandom } from "@game/shared";

import {
  advanceBallMovePlayers,
  applyBallMoveCast,
  applyBallMoveDirection,
  resolveBallMovePlayerAtTick,
  resetBallMovePlayers,
  type BallMoveMotionAnchor,
  type BallMoveMutablePlayer,
} from "../../rooms/ballMoveRules";
import {
  snapshotCanonicalMatchState,
  type CanonicalMatchState,
  type MatchEvidenceParticipant,
  type MatchEvidenceRosterEntry,
  type MatchEvidenceV3,
} from "./matchEvidence";

interface ReplayState {
  tick: number;
  phase: typeof GamePhase.Playing | typeof GamePhase.Settle;
  matchId: string;
  players: Map<string, BallMoveMutablePlayer>;
  alivePlayers: number;
}

export interface MatchReplayResult {
  initialState: CanonicalMatchState;
  finalTick: number;
  elapsedMs: number;
  finalState: CanonicalMatchState;
  participants: MatchEvidenceParticipant[];
}

export interface MatchReplayMetrics {
  playerResolutions: number;
}

export class MatchReplayError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "MatchReplayError";
  }
}

function mismatch(code: string, message: string): never {
  throw new MatchReplayError(code, message);
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function replayPlayers(evidence: MatchEvidenceV3): Map<string, BallMoveMutablePlayer> {
  return new Map(evidence.initialRoster.map((entry) => [entry.sessionId, {
    id: entry.sessionId,
    name: entry.name,
    x: 0,
    y: 0,
    hp: 0,
    maxHp: 0,
    alive: true,
    dirX: 0,
    dirY: 0,
    lastCastTick: {},
    level: 1,
  }]));
}

function maybeSettle(state: ReplayState): boolean {
  if (state.phase !== GamePhase.Playing || state.alivePlayers > 1) return false;
  state.phase = GamePhase.Settle;
  return true;
}

function deriveParticipants(
  evidence: MatchEvidenceV3,
  state: ReplayState,
  deathOrder: readonly string[],
): MatchEvidenceParticipant[] {
  const rosterBySession = new Map(evidence.initialRoster.map((entry) => [entry.sessionId, entry]));
  const order: Array<{ sessionId: string; survived: boolean }> = [];
  for (const rosterEntry of evidence.initialRoster) {
    const player = state.players.get(rosterEntry.sessionId);
    if (player?.alive) order.push({ sessionId: rosterEntry.sessionId, survived: true });
  }
  for (let index = deathOrder.length - 1; index >= 0; index--) {
    order.push({ sessionId: deathOrder[index], survived: false });
  }
  if (order.length !== evidence.initialRoster.length
      || new Set(order.map((entry) => entry.sessionId)).size !== evidence.initialRoster.length) {
    mismatch("PARTICIPANT_COVERAGE", "replay did not account for every initial participant exactly once");
  }
  return order.map((entry, index) => ({
    sessionId: entry.sessionId,
    userId: rosterBySession.get(entry.sessionId)?.userId ?? null,
    name: rosterBySession.get(entry.sessionId)?.name ?? "",
    place: index + 1,
    round: 0,
    elapsedMs: evidence.elapsedMs,
    survived: entry.survived,
  }));
}

/**
 * Recompute a ballMove v1 match in O(events + players). Tick gaps are resolved
 * analytically from motion anchors; finalTick is never used as a loop bound.
 */
export function replayMatchEvidenceV3(
  evidence: MatchEvidenceV3,
  metrics?: MatchReplayMetrics,
): MatchReplayResult {
  if (metrics) metrics.playerResolutions = 0;
  const state: ReplayState = {
    tick: 0,
    phase: GamePhase.Playing,
    matchId: evidence.matchId,
    players: replayPlayers(evidence),
    alivePlayers: evidence.initialRoster.length,
  };
  const motions = new Map<string, BallMoveMotionAnchor>();
  const rng = SeededRandom.stream(evidence.seed, "match");
  resetBallMovePlayers(state.players, motions, rng);
  const replayedInitial = snapshotCanonicalMatchState(state, evidence.initialRoster, motions);
  if (!sameCanonical(replayedInitial, evidence.initialState)) {
    mismatch("INITIAL_STATE", "seed/roster does not reproduce canonical initial state");
  }

  const deathOrder: string[] = [];
  const deaths = new Set<string>();
  const recordDeath = (sessionId: string): void => {
    if (deaths.has(sessionId)) return;
    deaths.add(sessionId);
    deathOrder.push(sessionId);
  };

  for (let index = 0; index < evidence.events.length; index++) {
    const event = evidence.events[index];
    if (state.phase !== GamePhase.Playing) {
      mismatch("EVENT_AFTER_SETTLE", `event ${index} appears after the replay settled`);
    }
    if (event.acceptedTick < state.tick) mismatch("EVENT_ORDER", `event ${index} moves backwards in time`);
    state.tick = event.acceptedTick;

    if (event.type === "move") {
      const player = state.players.get(event.sessionId);
      const motion = motions.get(event.sessionId);
      if (!player?.alive || !motion) mismatch("EVENT_REJECTED", `move ${index} is not acceptable`);
      if (metrics) metrics.playerResolutions++;
      applyBallMoveDirection(
        player,
        motion,
        event.dirX,
        event.dirY,
        event.acceptedTick,
        evidence.fixedStepMs,
      );
      continue;
    }

    if (event.type === "castSkill") {
      if (event.targetId !== null) {
        const target = state.players.get(event.targetId);
        const motion = motions.get(event.targetId);
        if (target?.alive && motion) {
          if (metrics) metrics.playerResolutions++;
          resolveBallMovePlayerAtTick(target, motion, event.acceptedTick, evidence.fixedStepMs);
        }
      }
      const result = applyBallMoveCast(
        state.players,
        rng,
        event.acceptedTick,
        evidence.fixedStepMs,
        event.sessionId,
        event.skillId,
        event.targetId ?? undefined,
      );
      if (!result) mismatch("EVENT_REJECTED", `cast ${index} is not acceptable`);
      if (result.diedSessionId !== undefined) {
        state.alivePlayers--;
        recordDeath(result.diedSessionId);
      }
      maybeSettle(state);
      continue;
    }

    const leaving = state.players.get(event.sessionId);
    if (!leaving) mismatch("EVENT_REJECTED", `leave ${index} is not acceptable`);
    if (leaving.alive) {
      state.alivePlayers--;
      recordDeath(event.sessionId);
    }
    state.players.delete(event.sessionId);
    motions.delete(event.sessionId);
    maybeSettle(state);
  }

  if (state.phase !== GamePhase.Settle) {
    mismatch("NOT_SETTLED", "event sequence does not settle the match");
  }
  if (state.tick !== evidence.finalTick) {
    mismatch("FINAL_TICK", `replayed tick ${state.tick} differs from ${evidence.finalTick}`);
  }
  if (metrics) metrics.playerResolutions += state.players.size;
  advanceBallMovePlayers(state.players, motions, state.tick, evidence.fixedStepMs);
  const elapsedMs = state.tick * evidence.fixedStepMs;
  if (elapsedMs !== evidence.elapsedMs) mismatch("ELAPSED", "replayed elapsedMs differs");
  const finalState = snapshotCanonicalMatchState(state, evidence.initialRoster, motions);
  if (!sameCanonical(finalState, evidence.finalState)) {
    mismatch("FINAL_STATE", "replayed canonical final state differs");
  }
  const participants = deriveParticipants(evidence, state, deathOrder);
  if (!sameCanonical(participants, evidence.participants)) {
    mismatch("PARTICIPANTS", "replayed participants differ");
  }
  return {
    initialState: replayedInitial,
    finalTick: state.tick,
    elapsedMs,
    finalState,
    participants,
  };
}

/** Helper used by GameRoom and tests to derive trusted settlement output. */
export function buildReplayParticipants(
  roster: readonly MatchEvidenceRosterEntry[],
  currentPlayers: { get(sessionId: string): BallMoveMutablePlayer | undefined },
  deathOrder: readonly string[],
  elapsedMs: number,
): MatchEvidenceParticipant[] {
  const rosterBySession = new Map(roster.map((entry) => [entry.sessionId, entry]));
  const order: Array<{ sessionId: string; survived: boolean }> = [];
  for (const entry of roster) {
    if (currentPlayers.get(entry.sessionId)?.alive) order.push({ sessionId: entry.sessionId, survived: true });
  }
  for (let index = deathOrder.length - 1; index >= 0; index--) {
    order.push({ sessionId: deathOrder[index], survived: false });
  }
  return order.map((entry, index) => ({
    sessionId: entry.sessionId,
    userId: rosterBySession.get(entry.sessionId)?.userId ?? null,
    name: rosterBySession.get(entry.sessionId)?.name ?? "",
    place: index + 1,
    round: 0,
    elapsedMs,
    survived: entry.survived,
  }));
}
