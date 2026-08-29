import assert from "node:assert/strict";
import { test } from "node:test";

import { GamePhase, SeededRandom, type GamePhaseType } from "@game/shared";

import {
  BALL_MOVE_RULESET_ID,
  BALL_MOVE_RULESET_VERSION,
  MATCH_EVIDENCE_MAX_ACCEPTED_INPUTS,
  MATCH_EVIDENCE_SCHEMA_VERSION,
  MatchEvidenceValidationError,
  snapshotCanonicalMatchState,
  validateMatchEvidenceV3,
  type MatchEvidenceEvent,
  type MatchEvidenceRosterEntry,
  type MatchEvidenceV3,
} from "../src/core/match/matchEvidence";
import {
  MatchReplayError,
  buildReplayParticipants,
  replayMatchEvidenceV3,
  type MatchReplayMetrics,
} from "../src/core/match/matchReplay";
import {
  advanceBallMovePlayers,
  applyBallMoveCast,
  applyBallMoveDirection,
  resetBallMovePlayers,
  type BallMoveMotionAnchor,
  type BallMoveMutablePlayer,
} from "../src/rooms/ballMoveRules";

const FIXED_STEP_MS = 50;

function cloneEvidence(evidence: MatchEvidenceV3): MatchEvidenceV3 {
  return structuredClone(evidence);
}

function makeEvidence(options: { finalTick?: number; moveCount?: number } = {}): MatchEvidenceV3 {
  const seed = 0x1234_5678;
  const finalTick = options.finalTick ?? 20;
  const moveCount = options.moveCount ?? 1;
  const roster: MatchEvidenceRosterEntry[] = [
    { sessionId: "session-a", userId: "user-a", name: "Alpha" },
    { sessionId: "session-b", userId: "user-b", name: "Beta" },
  ];
  const players = new Map<string, BallMoveMutablePlayer>(roster.map((entry) => [entry.sessionId, {
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
  const motions = new Map<string, BallMoveMotionAnchor>();
  const rng = SeededRandom.stream(seed, "match");
  const state: { tick: number; phase: GamePhaseType; matchId: string; players: typeof players } = {
    tick: 0,
    phase: GamePhase.Playing,
    matchId: "m_replay_v3",
    players,
  };
  resetBallMovePlayers(players, motions, rng);
  const initialState = snapshotCanonicalMatchState(state, roster, motions);
  const events: MatchEvidenceEvent[] = [];

  advanceBallMovePlayers(players, motions, 1, FIXED_STEP_MS);
  state.tick = 1;
  for (let index = 0; index < moveCount; index++) {
    const player = players.get("session-a")!;
    const motion = motions.get("session-a")!;
    const direction = applyBallMoveDirection(
      player,
      motion,
      index % 2 === 0 ? 1 : -1,
      0,
      state.tick,
      FIXED_STEP_MS,
    );
    events.push({
      type: "move",
      sessionId: "session-a",
      dirX: direction.x,
      dirY: direction.y,
      acceptedTick: state.tick,
    });
  }

  const castTick = finalTick;
  advanceBallMovePlayers(players, motions, castTick, FIXED_STEP_MS);
  state.tick = castTick;
  const cast = applyBallMoveCast(
    players,
    rng,
    state.tick,
    FIXED_STEP_MS,
    "session-a",
    1,
    "session-b",
  );
  assert.ok(cast && cast.diedSessionId === undefined);
  events.push({
    type: "castSkill",
    sessionId: "session-a",
    skillId: 1,
    targetId: "session-b",
    acceptedTick: state.tick,
  });

  advanceBallMovePlayers(players, motions, finalTick, FIXED_STEP_MS);
  state.tick = finalTick;
  players.delete("session-b");
  motions.delete("session-b");
  events.push({ type: "leave", sessionId: "session-b", acceptedTick: state.tick });
  state.phase = GamePhase.Settle;
  const elapsedMs = finalTick * FIXED_STEP_MS;
  const deathOrder = ["session-b"];
  const finalState = snapshotCanonicalMatchState(state, roster, motions);
  const participants = buildReplayParticipants(roster, players, deathOrder, elapsedMs);
  return {
    schemaVersion: MATCH_EVIDENCE_SCHEMA_VERSION,
    matchId: state.matchId,
    sId: 7,
    mode: 0,
    ruleset: { id: BALL_MOVE_RULESET_ID, version: BALL_MOVE_RULESET_VERSION },
    seed,
    fixedStepMs: FIXED_STEP_MS,
    mapIndex: 0,
    loadout: null,
    initialRoster: roster,
    initialState,
    events,
    finalTick,
    elapsedMs,
    finalState,
    participants,
  };
}

function assertEvidenceRejected(evidence: MatchEvidenceV3): void {
  assert.throws(
    () => replayMatchEvidenceV3(validateMatchEvidenceV3(evidence)),
    (error: unknown) => error instanceof MatchEvidenceValidationError || error instanceof MatchReplayError,
  );
}

test("v3 evidence exact-validates and replays production-shaped move/cast/leave state", () => {
  const evidence = validateMatchEvidenceV3(makeEvidence());
  const replay = replayMatchEvidenceV3(evidence);
  assert.deepEqual(replay.initialState, evidence.initialState);
  assert.deepEqual(replay.finalState, evidence.finalState);
  assert.deepEqual(replay.participants, evidence.participants);
});

test("v3 replay rejects deleted move, cast, or leave events", () => {
  for (const type of ["move", "castSkill", "leave"] as const) {
    const evidence = cloneEvidence(makeEvidence());
    const index = evidence.events.findIndex((event) => event.type === type);
    evidence.events.splice(index, 1);
    assertEvidenceRejected(evidence);
  }
});

test("v3 replay rejects event payload/tick changes and cast/leave reordering", () => {
  const payload = cloneEvidence(makeEvidence());
  const move = payload.events.find((event) => event.type === "move")!;
  if (move.type === "move") move.dirX = -move.dirX;
  assertEvidenceRejected(payload);

  const tick = cloneEvidence(makeEvidence());
  tick.events[0].acceptedTick++;
  assertEvidenceRejected(tick);

  const reordered = cloneEvidence(makeEvidence());
  const castIndex = reordered.events.findIndex((event) => event.type === "castSkill");
  const leaveIndex = reordered.events.findIndex((event) => event.type === "leave");
  [reordered.events[castIndex], reordered.events[leaveIndex]] = [
    reordered.events[leaveIndex],
    reordered.events[castIndex],
  ];
  assert.equal(reordered.events[castIndex].acceptedTick, reordered.events[leaveIndex].acceptedTick);
  assertEvidenceRejected(reordered);
});

test("v3 replay rejects seed, ordered roster, final state/tick, and participants changes", () => {
  const seed = cloneEvidence(makeEvidence());
  seed.seed++;
  assertEvidenceRejected(seed);

  const roster = cloneEvidence(makeEvidence());
  roster.initialRoster.reverse();
  roster.initialState.players.reverse();
  assertEvidenceRejected(roster);

  const finalState = cloneEvidence(makeEvidence());
  finalState.finalState.players[0].hp--;
  assertEvidenceRejected(finalState);

  const finalTick = cloneEvidence(makeEvidence());
  finalTick.finalTick++;
  finalTick.elapsedMs = finalTick.finalTick * finalTick.fixedStepMs;
  finalTick.finalState.tick = finalTick.finalTick;
  for (const participant of finalTick.participants) participant.elapsedMs = finalTick.elapsedMs;
  assertEvidenceRejected(finalTick);

  const participants = cloneEvidence(makeEvidence());
  participants.participants[0].survived = false;
  assertEvidenceRejected(participants);
});

test("v3 validator classifies one-player and hostile event shapes without leaking reflection errors", () => {
  const onePlayer = cloneEvidence(makeEvidence());
  onePlayer.initialRoster.pop();
  assert.throws(
    () => validateMatchEvidenceV3(onePlayer),
    (error: unknown) => error instanceof MatchEvidenceValidationError && error.code === "ARRAY",
  );

  for (const malformed of [null, 1, "move"] as const) {
    const evidence = cloneEvidence(makeEvidence()) as unknown as { events: unknown[] };
    evidence.events[0] = malformed;
    assert.throws(() => validateMatchEvidenceV3(evidence), MatchEvidenceValidationError);
  }

  const getterEvidence = cloneEvidence(makeEvidence()) as unknown as { events: unknown[] };
  const getterEvent = { sessionId: "session-a", dirX: 1, dirY: 0, acceptedTick: 1 };
  Object.defineProperty(getterEvent, "type", { enumerable: true, get: () => "move" });
  getterEvidence.events[0] = getterEvent;
  assert.throws(
    () => validateMatchEvidenceV3(getterEvidence),
    (error: unknown) => error instanceof MatchEvidenceValidationError && error.code === "DATA_PROPERTY",
  );

  const target = { type: "move", sessionId: "session-a", dirX: 1, dirY: 0, acceptedTick: 1 };
  const { proxy, revoke } = Proxy.revocable(target, {});
  revoke();
  const proxyEvidence = cloneEvidence(makeEvidence()) as unknown as { events: unknown[] };
  proxyEvidence.events[0] = proxy;
  assert.throws(
    () => validateMatchEvidenceV3(proxyEvidence),
    (error: unknown) => error instanceof MatchEvidenceValidationError && error.code === "MALFORMED",
  );

  const tooManyInputs = makeEvidence({ moveCount: MATCH_EVIDENCE_MAX_ACCEPTED_INPUTS });
  assert.throws(
    () => validateMatchEvidenceV3(tooManyInputs),
    (error: unknown) => error instanceof MatchEvidenceValidationError
      && error.code === "ACCEPTED_INPUT_CAPACITY",
  );
});

test("v3 replay handles maximum input count and maximum safe tick in O(events + players)", () => {
  const evidence = validateMatchEvidenceV3(makeEvidence({
    finalTick: Number.MAX_SAFE_INTEGER,
    moveCount: MATCH_EVIDENCE_MAX_ACCEPTED_INPUTS - 1,
  }));
  const metrics: MatchReplayMetrics = { playerResolutions: -1 };
  const replay = replayMatchEvidenceV3(evidence, metrics);
  assert.equal(replay.finalTick, Number.MAX_SAFE_INTEGER);
  assert.equal(replay.elapsedMs, Number.MAX_SAFE_INTEGER * FIXED_STEP_MS);
  assert.ok(
    metrics.playerResolutions <= evidence.events.length + evidence.initialRoster.length,
    `${metrics.playerResolutions} resolutions must stay linear in ${evidence.events.length} events`,
  );
});
