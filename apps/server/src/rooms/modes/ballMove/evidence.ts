import { GamePhase } from "@game/shared";
import {
    BALL_MOVE_ROSTER_SIZE,
    BALL_MOVE_RULESET_ID,
    BALL_MOVE_RULESET_VERSION,
    MATCH_EVIDENCE_MAX_ACCEPTED_INPUTS,
    MATCH_EVIDENCE_SCHEMA_VERSION,
    snapshotCanonicalMatchState,
    type CanonicalMatchState,
    type MatchEvidenceEvent,
    type MatchEvidenceRosterEntry,
    type MatchEvidenceV3,
} from "../../../core/match/matchEvidence";
import { MATCH_MODE_CASUAL } from "../../../core/match/matchConsumer";
import { buildReplayParticipants } from "../../../core/match/matchReplay";
import type { GameRoomState } from "../../schema/GameRoomState";
import type { BallMoveMotionAnchor } from "./rules";
import type { AcceptedGameInput, GameRoomInput } from "./harness";

/**
 * ballMove v3 证据的房内录入侧（原 GameRoom 的 record 系列与 capture/build 整体下沉）。
 * 证据**格式**的所有权仍在 `core/match/matchEvidence.ts`（BALL_MOVE_* 常量与 canonical
 * 快照都从那里取）；这里只拥有「一局比赛内的录入与组装」。
 */

/**
 * Bound the in-memory accepted-input evidence retained for one match.  A room
 * must fail closed once the cap is reached rather than silently dropping an
 * input that would make the replay evidence incomplete.
 */
export const MAX_ACCEPTED_INPUTS = MATCH_EVIDENCE_MAX_ACCEPTED_INPUTS;

export function normalizeAcceptedInputLimit(limit: number | undefined): number {
    return typeof limit === "number"
        && Number.isSafeInteger(limit)
        && limit >= 1
        && limit <= MAX_ACCEPTED_INPUTS
        ? limit
        : MAX_ACCEPTED_INPUTS;
}

/** build() 需要的房间事实；由 mode 从捕获的 GameModeContext 提供。 */
export interface BallMoveEvidenceSource {
    readonly state: GameRoomState;
    readonly sId: number;
    readonly matchSeed: number;
    readonly fixedStepMs: number;
    userIdOf(sessionId: string): string | null;
}

/**
 * 一局比赛的 ballMove 事实容器：接受输入序列、证据事件、运动锚点、开局快照与死亡名次。
 * 每个 mode 实例（= 每房）一份；`resetForMatch` 与原 GameRoom.initializeMatchState 的
 * 清理语义逐项一致。
 */
export class BallMoveMatchTracker {
    readonly acceptedInputSequence: AcceptedGameInput[] = [];
    readonly matchEvidenceEvents: MatchEvidenceEvent[] = [];
    readonly motionAnchors = new Map<string, BallMoveMotionAnchor>();
    initialRoster: MatchEvidenceRosterEntry[] = [];
    initialMatchState: CanonicalMatchState | null = null;
    deathOrder: string[] = [];
    readonly deaths = new Set<string>();
    readonly maxAcceptedInputs: number;

    constructor(maxAcceptedInputs?: number) {
        this.maxAcceptedInputs = normalizeAcceptedInputLimit(maxAcceptedInputs);
    }

    resetForMatch(): void {
        this.acceptedInputSequence.length = 0;
        this.matchEvidenceEvents.length = 0;
        this.initialRoster = [];
        this.initialMatchState = null;
        this.deathOrder = [];
        this.deaths.clear();
    }

    hasInputCapacity(): boolean {
        return this.acceptedInputSequence.length < this.maxAcceptedInputs;
    }

    recordAcceptedInput(input: GameRoomInput, event: MatchEvidenceEvent): void {
        if (!this.hasInputCapacity()) throw new Error("accepted input capacity invariant violated");
        this.acceptedInputSequence.push({
            ...input,
            acceptedTick: event.acceptedTick,
        });
        this.matchEvidenceEvents.push(event);
    }

    recordLeaveEvent(sessionId: string, acceptedTick: number): void {
        const reservedCapacity = this.maxAcceptedInputs + BALL_MOVE_ROSTER_SIZE;
        if (this.matchEvidenceEvents.length >= reservedCapacity) {
            throw new Error("leave evidence capacity invariant violated");
        }
        this.matchEvidenceEvents.push({ type: "leave", sessionId, acceptedTick });
    }

    recordDeath(sessionId: string): void {
        if (this.deaths.has(sessionId)) return;
        this.deaths.add(sessionId);
        this.deathOrder.push(sessionId);
    }

    /** 只读副本，避免测试/回放调用方改写房内输入历史。 */
    snapshotAcceptedInputs(): readonly AcceptedGameInput[] {
        return this.acceptedInputSequence.map((input) => ({ ...input }));
    }

    /** 原 GameRoom.captureInitialEvidenceState：mode start boundary 之后、phase=Playing 之前调用。 */
    captureInitialState(source: BallMoveEvidenceSource): void {
        const roster: MatchEvidenceRosterEntry[] = [];
        source.state.players.forEach((player, sessionId) => {
            roster.push({
                sessionId,
                userId: source.userIdOf(sessionId),
                name: player.name,
            });
        });
        if (roster.length !== BALL_MOVE_ROSTER_SIZE) {
            throw new Error(`ballMove initial roster must contain ${BALL_MOVE_ROSTER_SIZE} players`);
        }
        this.initialRoster = roster;
        this.initialMatchState = snapshotCanonicalMatchState(
            {
                tick: source.state.tick,
                phase: GamePhase.Playing,
                matchId: source.state.matchId,
                players: source.state.players,
            },
            roster,
            this.motionAnchors,
        );
    }

    /** 原 GameRoom.buildMatchEvidence：任一完整性前提不成立即返回 null（证据静默丢弃）。 */
    build(source: BallMoveEvidenceSource): MatchEvidenceV3 | null {
        const initialState = this.initialMatchState;
        if (!initialState
            || this.initialRoster.length !== BALL_MOVE_ROSTER_SIZE
            || this.matchEvidenceEvents.length < 1
            || !this.initialRoster.some((entry) => entry.userId !== null)) {
            return null;
        }
        const elapsedMs = source.state.tick * source.fixedStepMs;
        const participants = buildReplayParticipants(
            this.initialRoster,
            source.state.players,
            this.deathOrder,
            elapsedMs,
        );
        if (participants.length !== this.initialRoster.length) return null;
        return {
            schemaVersion: MATCH_EVIDENCE_SCHEMA_VERSION,
            matchId: source.state.matchId,
            sId: source.sId,
            mode: MATCH_MODE_CASUAL,
            ruleset: { id: BALL_MOVE_RULESET_ID, version: BALL_MOVE_RULESET_VERSION },
            seed: source.matchSeed,
            fixedStepMs: source.fixedStepMs,
            mapIndex: 0,
            loadout: null,
            initialRoster: this.initialRoster.map((entry) => ({ ...entry })),
            initialState,
            events: this.matchEvidenceEvents.map((event) => ({ ...event })),
            finalTick: source.state.tick,
            elapsedMs,
            finalState: snapshotCanonicalMatchState(source.state, this.initialRoster, this.motionAnchors),
            participants,
        };
    }
}

/** roster 与 ballMove v1 证据的自洽闸（原 assertGameModeRoster 的 ballMove 耦合段，措辞不变）。 */
export function assertBallMoveRosterCompatible(
    key: string,
    roster: { readonly min: number; readonly autoStart: number },
): void {
    // ballMove v1 证据把 initialRoster 冻结成**恰好** BALL_MOVE_ROSTER_SIZE 条（producer 与
    // verifier 两侧都按 exactArray 校验），所以声明该证据却配了别的开局人数，是一条自相
    // 矛盾的声明。⛔ 不连 max 一起断言：max 是座位上限，与「开局时恰好几人」不是同一件事。
    if (roster.min !== BALL_MOVE_ROSTER_SIZE || roster.autoStart !== BALL_MOVE_ROSTER_SIZE) {
        throw new Error(
            `[GameModeRegistry] mode ${key} 声明了 ballMove v1 证据，其 roster.min/autoStart `
            + `必须都是 ${BALL_MOVE_ROSTER_SIZE}，实际 min=${roster.min} autoStart=${roster.autoStart}`,
        );
    }
}
