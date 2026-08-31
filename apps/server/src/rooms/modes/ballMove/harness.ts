import { C2S, validateC2SPayload, type ICastSkillReq, type IMoveReq } from "@game/shared";

/**
 * ballMove 的测试/回放注入边界（原 GameRoom 模块级实现整体下沉）。
 * 注入输入不是玩法契约的一部分：其它玩法不需要实现 ballMove 的输入形状。
 */

/** Internal envelope bound for replay/session identifiers (payload bounds live in shared). */
export const MAX_INPUT_SESSION_ID_LENGTH = 64;
/** Bound replay input work before entering the synchronous simulation loop. */
export const MAX_INPUTS_PER_SOURCE = 256;

/**
 * 测试/回放可注入的输入。tick 为空时在当前逻辑帧应用；有值时只在指定帧应用。
 * 网络消息经过同一套 runtime schema 后也会落入 accepted input 序列。
 */
export type GameRoomInput =
    | { type: "move"; sessionId: string; dirX: number; dirY: number; tick?: number }
    | { type: "castSkill"; sessionId: string; skillId: number; targetId?: string; tick?: number };

export type GameRoomInputSource = (tick: number) => readonly GameRoomInput[] | undefined;

export type AcceptedGameInput = GameRoomInput & {
    /** 接受该输入时的逻辑帧。 */
    acceptedTick: number;
};

const INJECTED_MOVE_KEYS = ["type", "sessionId", "dirX", "dirY"] as const;
const INJECTED_CAST_KEYS = ["type", "sessionId", "skillId"] as const;
const INJECTED_MOVE_OPTIONAL_KEYS = ["tick"] as const;
const INJECTED_CAST_OPTIONAL_KEYS = ["targetId", "tick"] as const;

/** payload 域与 exact-key 语义仍以 shared validator 为唯一真源；失败即丢弃。 */
function sharedPayload<T>(messageType: typeof C2S.Move | typeof C2S.CastSkill, input: unknown): T | undefined {
    try {
        return validateC2SPayload(messageType, input) as T;
    } catch {
        return undefined;
    }
}

/**
 * `injectInput()` and replay adapters are test/server boundaries rather than a
 * JSON transport.  Keep their values just as defensive as wire payloads:
 * inspect a hostile object once, then return a fresh plain-data snapshot.
 * Every reflective/property operation is deliberately inside the catch so a
 * revoked Proxy or throwing getter is treated as a dropped input.
 */
export function snapshotInjectedInput(input: unknown): GameRoomInput | undefined {
    try {
        if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
        const proto = Object.getPrototypeOf(input);
        if (proto !== Object.prototype && proto !== null) return undefined;

        const names = Object.getOwnPropertyNames(input);
        if (Object.getOwnPropertySymbols(input).length > 0) return undefined;
        const record = input as Record<string, unknown>;
        const type = record.type;
        const required = type === "move" ? INJECTED_MOVE_KEYS : type === "castSkill" ? INJECTED_CAST_KEYS : undefined;
        const optional = type === "move"
            ? INJECTED_MOVE_OPTIONAL_KEYS
            : type === "castSkill"
                ? INJECTED_CAST_OPTIONAL_KEYS
                : undefined;
        if (!required || !optional) return undefined;
        const allowed = new Set<string>([...required, ...optional]);
        if (names.length < required.length || names.some((name) => !allowed.has(name))) return undefined;
        if (required.some((name) => !names.includes(name))) return undefined;
        if (names.length !== required.length
            + names.filter((name) => (optional as readonly string[]).includes(name)).length) {
            return undefined;
        }

        const sessionId = record.sessionId;
        if (typeof sessionId !== "string" || sessionId.length < 1 || sessionId.length > MAX_INPUT_SESSION_ID_LENGTH) {
            return undefined;
        }
        const rawTick: unknown = names.includes("tick") ? record.tick : undefined;
        let tick: number | undefined;
        if (rawTick !== undefined) {
            if (typeof rawTick !== "number" || !Number.isSafeInteger(rawTick) || rawTick < 0) return undefined;
            tick = rawTick;
        }

        if (type === "move") {
            const data = sharedPayload<IMoveReq>(C2S.Move, { dirX: record.dirX, dirY: record.dirY });
            if (!data) return undefined;
            return tick === undefined
                ? { type: "move", sessionId, dirX: data.dirX, dirY: data.dirY }
                : { type: "move", sessionId, dirX: data.dirX, dirY: data.dirY, tick };
        }

        const targetId = names.includes("targetId") ? record.targetId : undefined;
        const data = sharedPayload<ICastSkillReq>(C2S.CastSkill, {
            skillId: record.skillId,
            ...(targetId === undefined ? {} : { targetId }),
        });
        if (!data) return undefined;
        return tick === undefined
            ? (data.targetId === undefined
                ? { type: "castSkill", sessionId, skillId: data.skillId }
                : { type: "castSkill", sessionId, skillId: data.skillId, targetId: data.targetId })
            : (data.targetId === undefined
                ? { type: "castSkill", sessionId, skillId: data.skillId, tick }
                : { type: "castSkill", sessionId, skillId: data.skillId, targetId: data.targetId, tick });
    } catch {
        return undefined;
    }
}
