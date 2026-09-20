/**
 * mmoWorld wire（mmo kit 的世界形态玩法；docs/MMO.md §7.4）。token 按「面」归属，任一 token 变化 bump 该面在 apps/kits/mmo/kit.json 的 version。
 *  - C2S（Active 才收；world 玩法的 phases 以 GamePhase.Playing 表示 WorldPhase.Active）：move（意图：方向或点地，⛔ 客户端不上报坐标）、
 *    target、cast、interact、choose、pickup、transfer、baselineRequest；
 *  - S2C perSession（框架观察者同步 MF5b：enter / update / leave + baselineBegin / Chunk / End 六件，差分 / 编号 / 投递归框架；
 *    ⚠ §7.4 草案的单一 `delta` token 在 MF5 落地为六件分流，本文件以框架形态为准）、private（本人私有流）、opResult（durable 命令回执）、
 *    transferReady（交接就绪，凭据原文只此一处出网）、prompt（编排提示）；S2C 直发：pos（本人移动回执，movement 面按 seq 和解，MK1-B1）；
 *  - S2C 分线广播：scriptState（≤ MMO_SCRIPT_STATE_MAX_KEYS 个标量键）、notice。
 * 附近聊天 ⛔ 不是本玩法 token（框架 core `c2s/s2c.world.chat`，§6.5.1）。数值域只做 wire 边界闸：地图 size 来自内容包（content 面）。
 */
import { GamePhase } from "../../constants/game";
import { OBSERVER_SYNC_LIMITS } from "../../protocol/observerSync";
import { assertExactKeys, boundedString, finiteInteger, finiteNumber, isPlainRecord, type PlainRecord, WireValidationError } from "../../protocol/http";
import { defineC2S, defineS2C } from "../defineGameplayWire";

/** 世界坐标上限（wire 闸；实际地图 size 由内容包 IMapDef.size 决定，服务端再按图钳）。 */
export const MMO_WORLD_COORD_MAX = 1_000_000;
/** HP / MP 上限（wire 闸）。 */
export const MMO_WORLD_STAT_MAX = 100_000_000;
/** 编排公开状态最多键数（§7.4 scriptState ≤ 16 键标量）。 */
export const MMO_SCRIPT_STATE_MAX_KEYS = 16;
/** 提示最多选项数。 */
export const MMO_PROMPT_MAX_CHOICES = 8;

export type MmoEntityKind = "character" | "creature" | "npc" | "loot" | "portal";
export type MmoNoticeLevel = "info" | "warn" | "alert";
export type MmoOpResultKind = "ok" | "rejected" | "duplicate";

export interface IMmoVec2 {
    readonly x: number;
    readonly y: number;
}

/** 视野内可见投影（公开投影，⛔ 无私有字段；私有字段走 private）。 */
export interface IMmoEntityWire {
    readonly id: string;
    readonly kind: MmoEntityKind;
    /** 内容包模板 id（角色为职业 id） */
    readonly templateId: string;
    readonly name: string;
    readonly x: number;
    readonly y: number;
    /** 公开投影修订号（位置 / hp 变即 +1） */
    readonly rev: number;
    readonly hp: number;
    readonly hpMax: number;
    readonly level: number;
}

/** 移动意图：dir（摇杆方向，分量 ∈ [-1, 1]）与 target（点地）二选一（validator 强制恰好一个）。 */
export interface IMmoWorldMoveReq { readonly seq: number; readonly dir?: IMmoVec2; readonly target?: IMmoVec2 }
export interface IMmoWorldTargetReq { readonly entityId: string | null }
export interface IMmoWorldCastReq { readonly seq: number; readonly spellId: string; readonly targetId?: string }
export interface IMmoWorldInteractReq { readonly entityId: string; readonly interactId?: string }
export interface IMmoWorldChooseReq { readonly promptId: string; readonly choiceId: string }
export interface IMmoWorldPickupReq { readonly lootId: string; readonly clientReqId: string }
export interface IMmoWorldTransferReq { readonly portalId: string; readonly clientReqId: string }
/** 世界身份是 instanceId / authorityEpoch（⛔ 不用 GameRoom 的 roomEpochId）；重连走 join 信封 resumeSeq。 */
export interface IMmoWorldBaselineRequestReq { readonly authorityEpoch: number; readonly afterSeq: number }

export interface IMmoWorldEnter { readonly seq: number; readonly tick: number; readonly entity: IMmoEntityWire }
export interface IMmoWorldUpdate { readonly seq: number; readonly tick: number; readonly id: string; readonly x: number; readonly y: number; readonly rev: number; readonly hp: number }
export interface IMmoWorldLeave { readonly seq: number; readonly tick: number; readonly id: string }
/** 本人私有流（与视野流共用单 seq 流）：MK0 只有 hp / mp；bag / cooldowns / quest / vars 随 MK2–MK4 增列（可选键）。 */
export interface IMmoWorldPrivate { readonly seq: number; readonly tick: number; readonly hp: number; readonly hpMax: number; readonly mp: number; readonly mpMax: number }
/** 本人移动回执（movement 面，MK1-B1）：服务端权威位置 + 它反映到的意图 seq（客户端按 seq 和解本地预测）；直发回执，⛔ 不进观察者单流。 */
export interface IMmoWorldPos { readonly seq: number; readonly tick: number; readonly x: number; readonly y: number }
export interface IMmoWorldOpResult { readonly clientReqId: string; readonly result: MmoOpResultKind; readonly detail?: string }
export interface IMmoWorldTransferReady { readonly transferId: string; readonly worldAddress: string; readonly ticket: string; readonly expiresAt: number }
export interface IMmoWorldPromptChoice { readonly choiceId: string; readonly text: string }
export interface IMmoWorldPrompt { readonly promptId: string; readonly packId: string; readonly choices: readonly IMmoWorldPromptChoice[] }
export type MmoScalar = string | number | boolean;
export interface IMmoWorldScriptState { readonly packId: string; readonly rev: number; readonly state: Readonly<Record<string, MmoScalar>> }
export interface IMmoWorldNotice { readonly text: string; readonly level: MmoNoticeLevel }
export interface IMmoWorldBaselineBegin { readonly baselineId: string; readonly seq: number; readonly tick: number; readonly chunkCount: number; readonly itemCount: number }
export interface IMmoWorldBaselineChunk { readonly baselineId: string; readonly seq: number; readonly index: number; readonly items: readonly IMmoEntityWire[] }
export interface IMmoWorldBaselineEnd { readonly baselineId: string; readonly seq: number; readonly checksum: string }

function recordOf(input: unknown, path: string): PlainRecord {
    if (!isPlainRecord(input)) throw new WireValidationError("MESSAGE_OBJECT", path);
    return input;
}

function idOf(value: unknown, path: string): string {
    const id = boundedString(value, path, 1, 64);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(id)) throw new WireValidationError("MESSAGE_FIELD_RANGE", path);
    return id;
}

function kindOf(value: unknown, path: string): MmoEntityKind {
    if (value !== "character" && value !== "creature" && value !== "npc" && value !== "loot" && value !== "portal") throw new WireValidationError("MESSAGE_FIELD_RANGE", path);
    return value;
}

function vec2Of(input: unknown, path: string, min: number, max: number): IMmoVec2 {
    const value = recordOf(input, path);
    assertExactKeys(value, ["x", "y"], [], path);
    return { x: finiteNumber(value.x, `${path}.x`, min, max), y: finiteNumber(value.y, `${path}.y`, min, max) };
}

function entityOf(input: unknown, path: string): IMmoEntityWire {
    const value = recordOf(input, path);
    assertExactKeys(value, ["id", "kind", "templateId", "name", "x", "y", "rev", "hp", "hpMax", "level"], [], path);
    return {
        id: idOf(value.id, `${path}.id`),
        kind: kindOf(value.kind, `${path}.kind`),
        templateId: idOf(value.templateId, `${path}.templateId`),
        name: boundedString(value.name, `${path}.name`, 0, 32),
        x: finiteNumber(value.x, `${path}.x`, 0, MMO_WORLD_COORD_MAX),
        y: finiteNumber(value.y, `${path}.y`, 0, MMO_WORLD_COORD_MAX),
        rev: finiteInteger(value.rev, `${path}.rev`, 0, Number.MAX_SAFE_INTEGER),
        hp: finiteInteger(value.hp, `${path}.hp`, 0, MMO_WORLD_STAT_MAX),
        hpMax: finiteInteger(value.hpMax, `${path}.hpMax`, 1, MMO_WORLD_STAT_MAX),
        level: finiteInteger(value.level, `${path}.level`, 1, 65535),
    };
}

function envelopeOf(value: PlainRecord, path: string): { readonly seq: number; readonly tick: number } {
    return {
        seq: finiteInteger(value.seq, `${path}.seq`, 1, Number.MAX_SAFE_INTEGER),
        tick: finiteInteger(value.tick, `${path}.tick`, 0, Number.MAX_SAFE_INTEGER),
    };
}

function validateMove(input: unknown): IMmoWorldMoveReq {
    const value = recordOf(input, "payload");
    const seq = finiteInteger(value.seq, "payload.seq", 0, Number.MAX_SAFE_INTEGER);
    if (value.dir !== undefined) {
        assertExactKeys(value, ["seq", "dir"], [], "payload");
        return { seq, dir: vec2Of(value.dir, "payload.dir", -1, 1) };
    }
    assertExactKeys(value, ["seq", "target"], [], "payload");
    return { seq, target: vec2Of(value.target, "payload.target", 0, MMO_WORLD_COORD_MAX) };
}

function validateTarget(input: unknown): IMmoWorldTargetReq {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["entityId"], [], "payload");
    return { entityId: value.entityId === null ? null : idOf(value.entityId, "payload.entityId") };
}

function validateCast(input: unknown): IMmoWorldCastReq {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["seq", "spellId"], ["targetId"], "payload");
    const out: IMmoWorldCastReq = { seq: finiteInteger(value.seq, "payload.seq", 0, Number.MAX_SAFE_INTEGER), spellId: idOf(value.spellId, "payload.spellId") };
    return value.targetId === undefined ? out : { ...out, targetId: idOf(value.targetId, "payload.targetId") };
}

function validateInteract(input: unknown): IMmoWorldInteractReq {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["entityId"], ["interactId"], "payload");
    const out: IMmoWorldInteractReq = { entityId: idOf(value.entityId, "payload.entityId") };
    return value.interactId === undefined ? out : { ...out, interactId: idOf(value.interactId, "payload.interactId") };
}

function validateChoose(input: unknown): IMmoWorldChooseReq {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["promptId", "choiceId"], [], "payload");
    return { promptId: idOf(value.promptId, "payload.promptId"), choiceId: idOf(value.choiceId, "payload.choiceId") };
}

function validatePickup(input: unknown): IMmoWorldPickupReq {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["lootId", "clientReqId"], [], "payload");
    return { lootId: idOf(value.lootId, "payload.lootId"), clientReqId: idOf(value.clientReqId, "payload.clientReqId") };
}

function validateTransfer(input: unknown): IMmoWorldTransferReq {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["portalId", "clientReqId"], [], "payload");
    return { portalId: idOf(value.portalId, "payload.portalId"), clientReqId: idOf(value.clientReqId, "payload.clientReqId") };
}

function validateBaselineRequest(input: unknown): IMmoWorldBaselineRequestReq {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["authorityEpoch", "afterSeq"], [], "payload");
    return {
        authorityEpoch: finiteInteger(value.authorityEpoch, "payload.authorityEpoch", 1, Number.MAX_SAFE_INTEGER),
        afterSeq: finiteInteger(value.afterSeq, "payload.afterSeq", 0, Number.MAX_SAFE_INTEGER),
    };
}

function validateEnter(input: unknown): IMmoWorldEnter {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["seq", "tick", "entity"], [], "payload");
    return { ...envelopeOf(value, "payload"), entity: entityOf(value.entity, "payload.entity") };
}

function validateUpdate(input: unknown): IMmoWorldUpdate {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["seq", "tick", "id", "x", "y", "rev", "hp"], [], "payload");
    return {
        ...envelopeOf(value, "payload"),
        id: idOf(value.id, "payload.id"),
        x: finiteNumber(value.x, "payload.x", 0, MMO_WORLD_COORD_MAX),
        y: finiteNumber(value.y, "payload.y", 0, MMO_WORLD_COORD_MAX),
        rev: finiteInteger(value.rev, "payload.rev", 0, Number.MAX_SAFE_INTEGER),
        hp: finiteInteger(value.hp, "payload.hp", 0, MMO_WORLD_STAT_MAX),
    };
}

function validateLeave(input: unknown): IMmoWorldLeave {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["seq", "tick", "id"], [], "payload");
    return { ...envelopeOf(value, "payload"), id: idOf(value.id, "payload.id") };
}

function validatePrivate(input: unknown): IMmoWorldPrivate {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["seq", "tick", "hp", "hpMax", "mp", "mpMax"], [], "payload");
    return {
        ...envelopeOf(value, "payload"),
        hp: finiteInteger(value.hp, "payload.hp", 0, MMO_WORLD_STAT_MAX),
        hpMax: finiteInteger(value.hpMax, "payload.hpMax", 1, MMO_WORLD_STAT_MAX),
        mp: finiteInteger(value.mp, "payload.mp", 0, MMO_WORLD_STAT_MAX),
        mpMax: finiteInteger(value.mpMax, "payload.mpMax", 0, MMO_WORLD_STAT_MAX),
    };
}

function validatePos(input: unknown): IMmoWorldPos {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["seq", "tick", "x", "y"], [], "payload");
    return {
        seq: finiteInteger(value.seq, "payload.seq", 0, Number.MAX_SAFE_INTEGER),
        tick: finiteInteger(value.tick, "payload.tick", 0, Number.MAX_SAFE_INTEGER),
        x: finiteNumber(value.x, "payload.x", 0, MMO_WORLD_COORD_MAX),
        y: finiteNumber(value.y, "payload.y", 0, MMO_WORLD_COORD_MAX),
    };
}

function validateOpResult(input: unknown): IMmoWorldOpResult {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["clientReqId", "result"], ["detail"], "payload");
    if (value.result !== "ok" && value.result !== "rejected" && value.result !== "duplicate") throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.result");
    const out: IMmoWorldOpResult = { clientReqId: idOf(value.clientReqId, "payload.clientReqId"), result: value.result };
    return value.detail === undefined ? out : { ...out, detail: boundedString(value.detail, "payload.detail", 0, 128) };
}

function validateTransferReady(input: unknown): IMmoWorldTransferReady {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["transferId", "worldAddress", "ticket", "expiresAt"], [], "payload");
    return {
        transferId: boundedString(value.transferId, "payload.transferId", 1, 64),
        worldAddress: boundedString(value.worldAddress, "payload.worldAddress", 1, 128),
        ticket: boundedString(value.ticket, "payload.ticket", 16, 128),
        expiresAt: finiteInteger(value.expiresAt, "payload.expiresAt", 0, Number.MAX_SAFE_INTEGER),
    };
}

function validatePrompt(input: unknown): IMmoWorldPrompt {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["promptId", "packId", "choices"], [], "payload");
    if (!Array.isArray(value.choices) || value.choices.length === 0 || value.choices.length > MMO_PROMPT_MAX_CHOICES) throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.choices");
    const choices = value.choices.map((choice, index) => {
        const record = recordOf(choice, `payload.choices[${index}]`);
        assertExactKeys(record, ["choiceId", "text"], [], `payload.choices[${index}]`);
        return { choiceId: idOf(record.choiceId, `payload.choices[${index}].choiceId`), text: boundedString(record.text, `payload.choices[${index}].text`, 1, 64) };
    });
    return { promptId: idOf(value.promptId, "payload.promptId"), packId: idOf(value.packId, "payload.packId"), choices };
}

function validateScriptState(input: unknown): IMmoWorldScriptState {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["packId", "rev", "state"], [], "payload");
    const state = recordOf(value.state, "payload.state");
    const keys = Object.keys(state);
    if (keys.length > MMO_SCRIPT_STATE_MAX_KEYS) throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.state");
    const out: Record<string, MmoScalar> = {};
    for (const key of keys) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(key)) throw new WireValidationError("MESSAGE_FIELD_RANGE", `payload.state.${key}`);
        const scalar = state[key];
        if (typeof scalar === "boolean") out[key] = scalar;
        else if (typeof scalar === "number") out[key] = finiteNumber(scalar, `payload.state.${key}`);
        else out[key] = boundedString(scalar, `payload.state.${key}`, 0, 64);
    }
    return { packId: idOf(value.packId, "payload.packId"), rev: finiteInteger(value.rev, "payload.rev", 0, Number.MAX_SAFE_INTEGER), state: out };
}

function validateNotice(input: unknown): IMmoWorldNotice {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["text", "level"], [], "payload");
    if (value.level !== "info" && value.level !== "warn" && value.level !== "alert") throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.level");
    return { text: boundedString(value.text, "payload.text", 1, 200), level: value.level };
}

function validateBaselineBegin(input: unknown): IMmoWorldBaselineBegin {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["baselineId", "seq", "tick", "chunkCount", "itemCount"], [], "payload");
    return {
        baselineId: boundedString(value.baselineId, "payload.baselineId", 1, 160),
        ...envelopeOf(value, "payload"),
        chunkCount: finiteInteger(value.chunkCount, "payload.chunkCount", 0, 4096),
        itemCount: finiteInteger(value.itemCount, "payload.itemCount", 0, OBSERVER_SYNC_LIMITS.interestMaxEntities),
    };
}

function validateBaselineChunk(input: unknown): IMmoWorldBaselineChunk {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["baselineId", "seq", "index", "items"], [], "payload");
    if (!Array.isArray(value.items) || value.items.length > OBSERVER_SYNC_LIMITS.baselineChunkItems) throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.items");
    return {
        baselineId: boundedString(value.baselineId, "payload.baselineId", 1, 160),
        seq: finiteInteger(value.seq, "payload.seq", 1, Number.MAX_SAFE_INTEGER),
        index: finiteInteger(value.index, "payload.index", 0, 4095),
        items: value.items.map((item, position) => entityOf(item, `payload.items[${position}]`)),
    };
}

function validateBaselineEnd(input: unknown): IMmoWorldBaselineEnd {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["baselineId", "seq", "checksum"], [], "payload");
    return {
        baselineId: boundedString(value.baselineId, "payload.baselineId", 1, 160),
        seq: finiteInteger(value.seq, "payload.seq", 1, Number.MAX_SAFE_INTEGER),
        checksum: boundedString(value.checksum, "payload.checksum", 8, 8),
    };
}

// ── C2S（面：movement / combat / world / orchestration / inventory）──────────────────────────────────────────────────
export const MmoWorldMove = defineC2S("c2s.mmoWorld.move", validateMove, { phases: [GamePhase.Playing], rateCost: 1 });
export const MmoWorldTarget = defineC2S("c2s.mmoWorld.target", validateTarget, { phases: [GamePhase.Playing], rateCost: 1 });
export const MmoWorldCast = defineC2S("c2s.mmoWorld.cast", validateCast, { phases: [GamePhase.Playing], rateCost: 2 });
export const MmoWorldInteract = defineC2S("c2s.mmoWorld.interact", validateInteract, { phases: [GamePhase.Playing], rateCost: 2 });
export const MmoWorldChoose = defineC2S("c2s.mmoWorld.choose", validateChoose, { phases: [GamePhase.Playing], rateCost: 2 });
export const MmoWorldPickup = defineC2S("c2s.mmoWorld.pickup", validatePickup, { phases: [GamePhase.Playing], rateCost: 2 });
export const MmoWorldTransfer = defineC2S("c2s.mmoWorld.transfer", validateTransfer, { phases: [GamePhase.Playing], rateCost: 4 });
export const MmoWorldBaselineRequest = defineC2S("c2s.mmoWorld.baselineRequest", validateBaselineRequest, { phases: [GamePhase.Playing], rateCost: 4 });
// ── S2C perSession（面：world / inventory / combat / orchestration）─────────────────────────────────────────────────
export const MmoWorldEnter = defineS2C("s2c.mmoWorld.enter", validateEnter, { perSession: true });
export const MmoWorldUpdate = defineS2C("s2c.mmoWorld.update", validateUpdate, { perSession: true, coalesceKey: "id" });
export const MmoWorldLeave = defineS2C("s2c.mmoWorld.leave", validateLeave, { perSession: true });
export const MmoWorldBaselineBegin = defineS2C("s2c.mmoWorld.baselineBegin", validateBaselineBegin, { perSession: true });
export const MmoWorldBaselineChunk = defineS2C("s2c.mmoWorld.baselineChunk", validateBaselineChunk, { perSession: true });
export const MmoWorldBaselineEnd = defineS2C("s2c.mmoWorld.baselineEnd", validateBaselineEnd, { perSession: true });
export const MmoWorldPrivate = defineS2C("s2c.mmoWorld.private", validatePrivate, { perSession: true });
export const MmoWorldPos = defineS2C("s2c.mmoWorld.pos", validatePos);
export const MmoWorldOpResult = defineS2C("s2c.mmoWorld.opResult", validateOpResult, { perSession: true });
export const MmoWorldTransferReady = defineS2C("s2c.mmoWorld.transferReady", validateTransferReady, { perSession: true });
export const MmoWorldPrompt = defineS2C("s2c.mmoWorld.prompt", validatePrompt, { perSession: true });
// ── S2C 分线广播（面：orchestration）──────────────────────────────────────────────────────────────────────────────
export const MmoWorldScriptState = defineS2C("s2c.mmoWorld.scriptState", validateScriptState);
export const MmoWorldNotice = defineS2C("s2c.mmoWorld.notice", validateNotice);
