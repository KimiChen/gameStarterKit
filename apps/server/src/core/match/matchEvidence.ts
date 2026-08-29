import {
  GamePhase,
  GameplayModeId,
  MAP_HEIGHT,
  MAP_WIDTH,
  MAX_PLAYERS,
  type GamePhaseType,
} from "@game/shared";

import type { BallMoveMotionAnchor, BallMoveMutablePlayer } from "../../rooms/ballMoveRules";

export const MATCH_EVIDENCE_SCHEMA_VERSION = 3;
export const BALL_MOVE_RULESET_VERSION = 1;
export const BALL_MOVE_RULESET_ID = GameplayModeId.BallMove;
export const BALL_MOVE_ROSTER_SIZE = 2;
export const MATCH_EVIDENCE_MAX_ACCEPTED_INPUTS = 16_384;
export const MATCH_EVIDENCE_MAX_EVENTS = MATCH_EVIDENCE_MAX_ACCEPTED_INPUTS + MAX_PLAYERS;

export interface MatchEvidenceRosterEntry {
  sessionId: string;
  userId: string | null;
  name: string;
}

export interface MatchEvidenceSkillClock {
  skillId: number;
  atTick: number;
}

export interface CanonicalMatchPlayerState {
  sessionId: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  dirX: number;
  dirY: number;
  lastCastTick: MatchEvidenceSkillClock[];
  level: number;
  motionAnchorX: number;
  motionAnchorY: number;
  motionAnchorTick: number;
}

export interface CanonicalMatchState {
  tick: number;
  phase: GamePhaseType;
  matchId: string;
  players: CanonicalMatchPlayerState[];
}

export type MatchEvidenceEvent =
  | {
    type: "move";
    sessionId: string;
    dirX: number;
    dirY: number;
    acceptedTick: number;
  }
  | {
    type: "castSkill";
    sessionId: string;
    skillId: number;
    targetId: string | null;
    acceptedTick: number;
  }
  | {
    type: "leave";
    sessionId: string;
    acceptedTick: number;
  };

export interface MatchEvidenceParticipant {
  sessionId: string;
  userId: string | null;
  name: string;
  place: number;
  round: number;
  elapsedMs: number;
  survived: boolean;
}

export interface MatchEvidenceV3 {
  schemaVersion: 3;
  matchId: string;
  sId: number;
  mode: 0;
  ruleset: {
    id: typeof BALL_MOVE_RULESET_ID;
    version: typeof BALL_MOVE_RULESET_VERSION;
  };
  seed: number;
  fixedStepMs: number;
  mapIndex: 0;
  loadout: null;
  initialRoster: MatchEvidenceRosterEntry[];
  initialState: CanonicalMatchState;
  events: MatchEvidenceEvent[];
  finalTick: number;
  elapsedMs: number;
  finalState: CanonicalMatchState;
  participants: MatchEvidenceParticipant[];
}

type JsonRecord = Record<string, unknown>;

export class MatchEvidenceValidationError extends TypeError {
  constructor(readonly code: string, readonly path: string) {
    super(`${code} at ${path}`);
    this.name = "MatchEvidenceValidationError";
  }
}

function fail(code: string, path: string): never {
  throw new MatchEvidenceValidationError(code, path);
}

function exactRecord(input: unknown, keys: readonly string[], path: string): JsonRecord {
  if (typeof input !== "object" || input === null || Array.isArray(input)) fail("OBJECT", path);
  const proto = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) fail("OBJECT", path);
  const names = Object.getOwnPropertyNames(input);
  if (Object.getOwnPropertySymbols(input).length !== 0
      || names.length !== keys.length
      || keys.some((key) => !names.includes(key))) fail("KEYS", path);
  const copy: JsonRecord = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) fail("DATA_PROPERTY", `${path}.${key}`);
    copy[key] = descriptor.value;
  }
  return copy;
}

function recordDataProperty(input: unknown, key: string, path: string): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) fail("OBJECT", path);
  const proto = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) fail("OBJECT", path);
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  if (!descriptor?.enumerable || !("value" in descriptor)) fail("DATA_PROPERTY", `${path}.${key}`);
  return descriptor.value;
}

function exactArray(input: unknown, path: string, min: number, max: number): unknown[] {
  if (!Array.isArray(input)) fail("ARRAY", path);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");
  if (!lengthDescriptor || !("value" in lengthDescriptor)
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < min || lengthDescriptor.value > max) fail("ARRAY", path);
  const length = lengthDescriptor.value;
  if (Object.getOwnPropertySymbols(input).length !== 0) fail("ARRAY", path);
  const names = Object.getOwnPropertyNames(input);
  if (names.length !== length + 1 || names.at(-1) !== "length") fail("ARRAY", path);
  const copy: unknown[] = [];
  for (let index = 0; index < length; index++) {
    if (names[index] !== String(index)) fail("ARRAY", path);
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) fail("DATA_PROPERTY", `${path}.${index}`);
    copy.push(descriptor.value);
  }
  return copy;
}

function uint(input: unknown, path: string, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || Object.is(input, -0)
      || input < 0 || input > max) fail("UINT", path);
  return input;
}

function positiveInt(input: unknown, path: string, max = Number.MAX_SAFE_INTEGER): number {
  const value = uint(input, path, max);
  if (value < 1) fail("POSITIVE_INT", path);
  return value;
}

function finite(input: unknown, path: string, min: number, max: number): number {
  if (typeof input !== "number" || !Number.isFinite(input) || Object.is(input, -0)
      || input < min || input > max) fail("NUMBER", path);
  return input;
}

function stringValue(input: unknown, path: string, min: number, max: number): string {
  if (typeof input !== "string" || input.length < min || input.length > max) fail("STRING", path);
  return input;
}

function nullableUserId(input: unknown, path: string): string | null {
  return input === null ? null : stringValue(input, path, 1, 128);
}

function copyRoster(input: unknown): MatchEvidenceRosterEntry[] {
  const values = exactArray(
    input,
    "evidence.initialRoster",
    BALL_MOVE_ROSTER_SIZE,
    BALL_MOVE_ROSTER_SIZE,
  );
  const sessions = new Set<string>();
  const users = new Set<string>();
  return values.map((item, index) => {
    const path = `evidence.initialRoster.${index}`;
    const value = exactRecord(item, ["sessionId", "userId", "name"], path);
    const sessionId = stringValue(value.sessionId, `${path}.sessionId`, 1, 64);
    const userId = nullableUserId(value.userId, `${path}.userId`);
    const name = stringValue(value.name, `${path}.name`, 1, 128);
    if (sessions.has(sessionId)) fail("DUPLICATE_SESSION", `${path}.sessionId`);
    if (userId !== null && users.has(userId)) fail("DUPLICATE_USER", `${path}.userId`);
    sessions.add(sessionId);
    if (userId !== null) users.add(userId);
    return { sessionId, userId, name };
  });
}

function copySkillClocks(input: unknown, path: string, stateTick: number): MatchEvidenceSkillClock[] {
  const values = exactArray(input, path, 0, 256);
  let previous = -1;
  return values.map((item, index) => {
    const itemPath = `${path}.${index}`;
    const value = exactRecord(item, ["skillId", "atTick"], itemPath);
    const skillId = uint(value.skillId, `${itemPath}.skillId`, 0xffff);
    const atTick = uint(value.atTick, `${itemPath}.atTick`, stateTick);
    if (skillId <= previous) fail("SKILL_CLOCK_ORDER", `${itemPath}.skillId`);
    previous = skillId;
    return { skillId, atTick };
  });
}

const PLAYER_STATE_KEYS = [
  "sessionId", "name", "x", "y", "hp", "maxHp", "alive", "dirX", "dirY",
  "lastCastTick", "level", "motionAnchorX", "motionAnchorY", "motionAnchorTick",
] as const;

function copyPlayerState(
  input: unknown,
  path: string,
  stateTick: number,
): CanonicalMatchPlayerState {
  const value = exactRecord(input, PLAYER_STATE_KEYS, path);
  const maxHp = finite(value.maxHp, `${path}.maxHp`, 0, Number.MAX_SAFE_INTEGER);
  const motionAnchorTick = uint(value.motionAnchorTick, `${path}.motionAnchorTick`, stateTick);
  if (typeof value.alive !== "boolean") fail("BOOLEAN", `${path}.alive`);
  return {
    sessionId: stringValue(value.sessionId, `${path}.sessionId`, 1, 64),
    name: stringValue(value.name, `${path}.name`, 1, 128),
    x: finite(value.x, `${path}.x`, 0, MAP_WIDTH),
    y: finite(value.y, `${path}.y`, 0, MAP_HEIGHT),
    hp: finite(value.hp, `${path}.hp`, 0, maxHp),
    maxHp,
    alive: value.alive,
    dirX: finite(value.dirX, `${path}.dirX`, -1, 1),
    dirY: finite(value.dirY, `${path}.dirY`, -1, 1),
    lastCastTick: copySkillClocks(value.lastCastTick, `${path}.lastCastTick`, stateTick),
    level: positiveInt(value.level, `${path}.level`, 1000),
    motionAnchorX: finite(value.motionAnchorX, `${path}.motionAnchorX`, 0, MAP_WIDTH),
    motionAnchorY: finite(value.motionAnchorY, `${path}.motionAnchorY`, 0, MAP_HEIGHT),
    motionAnchorTick,
  };
}

function copyState(
  input: unknown,
  path: string,
  expectedPhase: GamePhaseType,
  matchId: string,
  roster: readonly MatchEvidenceRosterEntry[],
  requireCompleteRoster: boolean,
): CanonicalMatchState {
  const value = exactRecord(input, ["tick", "phase", "matchId", "players"], path);
  const tick = uint(value.tick, `${path}.tick`);
  if (value.phase !== expectedPhase) fail("PHASE", `${path}.phase`);
  if (value.matchId !== matchId) fail("MATCH_ID_BINDING", `${path}.matchId`);
  const rawPlayers = exactArray(value.players, `${path}.players`, requireCompleteRoster ? roster.length : 0, roster.length);
  const rosterIndex = new Map(roster.map((entry, index) => [entry.sessionId, index]));
  let previousIndex = -1;
  const players = rawPlayers.map((item, index) => {
    const player = copyPlayerState(item, `${path}.players.${index}`, tick);
    const currentIndex = rosterIndex.get(player.sessionId);
    if (currentIndex === undefined || currentIndex <= previousIndex) {
      fail("PLAYER_ORDER", `${path}.players.${index}.sessionId`);
    }
    if (player.name !== roster[currentIndex].name) {
      fail("PLAYER_NAME_BINDING", `${path}.players.${index}.name`);
    }
    previousIndex = currentIndex;
    return player;
  });
  if (requireCompleteRoster && players.some((player, index) => player.sessionId !== roster[index].sessionId)) {
    fail("INITIAL_ROSTER_BINDING", `${path}.players`);
  }
  return { tick, phase: expectedPhase, matchId, players };
}

function copyEvents(
  input: unknown,
  roster: readonly MatchEvidenceRosterEntry[],
  finalTick: number,
): MatchEvidenceEvent[] {
  const values = exactArray(input, "evidence.events", 1, MATCH_EVIDENCE_MAX_EVENTS);
  const rosterIds = new Set(roster.map((entry) => entry.sessionId));
  const leftSessions = new Set<string>();
  let acceptedInputs = 0;
  let previousTick = 0;
  return values.map((item, index) => {
    const path = `evidence.events.${index}`;
    const type = recordDataProperty(item, "type", path);
    let expected: readonly string[];
    if (type === "move") expected = ["type", "sessionId", "dirX", "dirY", "acceptedTick"];
    else if (type === "castSkill") expected = ["type", "sessionId", "skillId", "targetId", "acceptedTick"];
    else if (type === "leave") expected = ["type", "sessionId", "acceptedTick"];
    else fail("EVENT_TYPE", `${path}.type`);
    const value = exactRecord(item, expected, path);
    const sessionId = stringValue(value.sessionId, `${path}.sessionId`, 1, 64);
    if (!rosterIds.has(sessionId)) fail("EVENT_SESSION", `${path}.sessionId`);
    if (leftSessions.has(sessionId)) fail("EVENT_AFTER_LEAVE", `${path}.sessionId`);
    const acceptedTick = uint(value.acceptedTick, `${path}.acceptedTick`, finalTick);
    if (index > 0 && acceptedTick < previousTick) fail("EVENT_ORDER", `${path}.acceptedTick`);
    previousTick = acceptedTick;
    if (type === "move") {
      if (++acceptedInputs > MATCH_EVIDENCE_MAX_ACCEPTED_INPUTS) {
        fail("ACCEPTED_INPUT_CAPACITY", path);
      }
      return {
        type,
        sessionId,
        dirX: finite(value.dirX, `${path}.dirX`, -1, 1),
        dirY: finite(value.dirY, `${path}.dirY`, -1, 1),
        acceptedTick,
      };
    }
    if (type === "castSkill") {
      if (++acceptedInputs > MATCH_EVIDENCE_MAX_ACCEPTED_INPUTS) {
        fail("ACCEPTED_INPUT_CAPACITY", path);
      }
      const targetId = value.targetId === null
        ? null
        : stringValue(value.targetId, `${path}.targetId`, 1, 64);
      return {
        type,
        sessionId,
        skillId: uint(value.skillId, `${path}.skillId`, 0xffff),
        targetId,
        acceptedTick,
      };
    }
    if (leftSessions.size >= roster.length) fail("LEAVE_CAPACITY", path);
    leftSessions.add(sessionId);
    return { type: "leave", sessionId, acceptedTick };
  });
}

function copyParticipants(
  input: unknown,
  roster: readonly MatchEvidenceRosterEntry[],
  elapsedMs: number,
): MatchEvidenceParticipant[] {
  const values = exactArray(input, "evidence.participants", roster.length, roster.length);
  const rosterBySession = new Map(roster.map((entry) => [entry.sessionId, entry]));
  const seen = new Set<string>();
  return values.map((item, index) => {
    const path = `evidence.participants.${index}`;
    const value = exactRecord(
      item,
      ["sessionId", "userId", "name", "place", "round", "elapsedMs", "survived"],
      path,
    );
    const sessionId = stringValue(value.sessionId, `${path}.sessionId`, 1, 64);
    const rosterEntry = rosterBySession.get(sessionId);
    if (!rosterEntry || seen.has(sessionId)) fail("PARTICIPANT_SESSION", `${path}.sessionId`);
    seen.add(sessionId);
    const userId = nullableUserId(value.userId, `${path}.userId`);
    const name = stringValue(value.name, `${path}.name`, 1, 128);
    if (userId !== rosterEntry.userId) fail("PARTICIPANT_USER", `${path}.userId`);
    if (name !== rosterEntry.name) fail("PARTICIPANT_NAME", `${path}.name`);
    if (value.place !== index + 1) fail("PARTICIPANT_PLACE", `${path}.place`);
    if (value.round !== 0) fail("PARTICIPANT_ROUND", `${path}.round`);
    if (value.elapsedMs !== elapsedMs) fail("PARTICIPANT_ELAPSED", `${path}.elapsedMs`);
    if (typeof value.survived !== "boolean") fail("BOOLEAN", `${path}.survived`);
    return { sessionId, userId, name, place: index + 1, round: 0, elapsedMs, survived: value.survived };
  });
}

const EVIDENCE_KEYS = [
  "schemaVersion", "matchId", "sId", "mode", "ruleset", "seed", "fixedStepMs", "mapIndex",
  "loadout", "initialRoster", "initialState", "events", "finalTick", "elapsedMs", "finalState",
  "participants",
] as const;

function validateMatchEvidenceV3Unchecked(input: unknown): MatchEvidenceV3 {
  const value = exactRecord(input, EVIDENCE_KEYS, "evidence");
  if (value.schemaVersion !== MATCH_EVIDENCE_SCHEMA_VERSION) fail("SCHEMA_VERSION", "evidence.schemaVersion");
  const matchId = stringValue(value.matchId, "evidence.matchId", 1, 40);
  const sId = uint(value.sId, "evidence.sId", 65_535);
  if (value.mode !== 0) fail("MODE", "evidence.mode");
  const ruleset = exactRecord(value.ruleset, ["id", "version"], "evidence.ruleset");
  if (ruleset.id !== BALL_MOVE_RULESET_ID || ruleset.version !== BALL_MOVE_RULESET_VERSION) {
    fail("RULESET", "evidence.ruleset");
  }
  const seed = uint(value.seed, "evidence.seed", 0xffff_ffff);
  const fixedStepMs = positiveInt(value.fixedStepMs, "evidence.fixedStepMs", 1000);
  if (Math.round(1000 / fixedStepMs) > 240) fail("FIXED_STEP", "evidence.fixedStepMs");
  if (value.mapIndex !== 0) fail("MAP_INDEX", "evidence.mapIndex");
  if (value.loadout !== null) fail("LOADOUT", "evidence.loadout");
  const initialRoster = copyRoster(value.initialRoster);
  const finalTick = uint(value.finalTick, "evidence.finalTick");
  const expectedElapsed = finalTick * fixedStepMs;
  const elapsedMs = finite(value.elapsedMs, "evidence.elapsedMs", 0, Number.MAX_VALUE);
  if (elapsedMs !== expectedElapsed) fail("ELAPSED_BINDING", "evidence.elapsedMs");
  const initialState = copyState(
    value.initialState,
    "evidence.initialState",
    GamePhase.Playing,
    matchId,
    initialRoster,
    true,
  );
  if (initialState.tick !== 0) fail("INITIAL_TICK", "evidence.initialState.tick");
  const events = copyEvents(value.events, initialRoster, finalTick);
  const finalState = copyState(
    value.finalState,
    "evidence.finalState",
    GamePhase.Settle,
    matchId,
    initialRoster,
    false,
  );
  if (finalState.tick !== finalTick) fail("FINAL_TICK_BINDING", "evidence.finalState.tick");
  const participants = copyParticipants(value.participants, initialRoster, elapsedMs);
  return {
    schemaVersion: MATCH_EVIDENCE_SCHEMA_VERSION,
    matchId,
    sId,
    mode: 0,
    ruleset: { id: BALL_MOVE_RULESET_ID, version: BALL_MOVE_RULESET_VERSION },
    seed,
    fixedStepMs,
    mapIndex: 0,
    loadout: null,
    initialRoster,
    initialState,
    events,
    finalTick,
    elapsedMs,
    finalState,
    participants,
  };
}

/** Exact validation returns a fresh, fixed-order payload safe to stringify. */
export function validateMatchEvidenceV3(input: unknown): MatchEvidenceV3 {
  try {
    return validateMatchEvidenceV3Unchecked(input);
  } catch (error) {
    if (error instanceof MatchEvidenceValidationError) throw error;
    throw new MatchEvidenceValidationError("MALFORMED", "evidence");
  }
}

export interface CanonicalStateSource {
  tick: number;
  phase: GamePhaseType;
  matchId: string;
  players: {
    get(sessionId: string): BallMoveMutablePlayer | undefined;
  };
}

function snapshotSkillClocks(lastCastTick: Record<number, number>): MatchEvidenceSkillClock[] {
  return Object.keys(lastCastTick).map((raw) => {
    if (!/^(?:0|[1-9]\d*)$/.test(raw)) fail("SKILL_CLOCK_KEY", "state.player.lastCastTick");
    const skillId = Number(raw);
    return { skillId, atTick: lastCastTick[skillId] };
  }).sort((left, right) => left.skillId - right.skillId);
}

/** Snapshot live state in roster order, including server-only motion state. */
export function snapshotCanonicalMatchState(
  state: CanonicalStateSource,
  roster: readonly MatchEvidenceRosterEntry[],
  motions: ReadonlyMap<string, BallMoveMotionAnchor>,
): CanonicalMatchState {
  const players: CanonicalMatchPlayerState[] = [];
  for (const rosterEntry of roster) {
    const player = state.players.get(rosterEntry.sessionId);
    if (!player) continue;
    const motion = motions.get(rosterEntry.sessionId);
    if (!motion) fail("MOTION_ANCHOR", `state.players.${rosterEntry.sessionId}`);
    players.push({
      sessionId: rosterEntry.sessionId,
      name: player.name,
      x: player.x,
      y: player.y,
      hp: player.hp,
      maxHp: player.maxHp,
      alive: player.alive,
      dirX: player.dirX,
      dirY: player.dirY,
      lastCastTick: snapshotSkillClocks(player.lastCastTick),
      level: player.level,
      motionAnchorX: motion.x,
      motionAnchorY: motion.y,
      motionAnchorTick: motion.tick,
    });
  }
  return { tick: state.tick, phase: state.phase, matchId: state.matchId, players };
}
