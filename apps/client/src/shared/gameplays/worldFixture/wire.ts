/**
 * worldFixture（MMO MF4 世界形态夹具，docs/MMO.md §5.1 夹具规则 / §5.4 MF4 / MF5b）的 wire：
 *  - C2S `move { dirX, dirY, seq }`：**意图**（方向分量 −1..1 的整数 + 客户端序号），坐标由服务端按常量速度积分
 *    （§4.6-6：⛔ 客户端不上报坐标）；`resync`：客户端请求重发只含兴趣集的 baseline（MF5b）；
 *  - S2C `pos { entityId, x, y, seq, tick }`：本人移动体的权威位置回执（mode 按会话 sendS2C；刻意不是 perSession——
 *    它是 MF4 的直发回执，与观察者流分开）；
 *  - S2C（MF5b-B3，全部 perSession）：视野流 `enter`（完整投影）/ `update`（变化投影，按 id 合并）/ `leave`（id）、
 *    本人私有流 `private`（移动体的 `stamina`，⛔ 不进 enter / update / baseline——私有字段对他人零泄露的判据）、
 *    只含兴趣集的 baseline 三件。
 * world 玩法 C2S 的 phases 以 `GamePhase.Playing` 表示 `WorldPhase.Active`：dispatcher 共用 GamePhase 词表，WorldRoom 把 Active
 * 映射为 playing、其余映射为 settle（只放 Ping）。地图 WORLD_FIXTURE_MAP_SIZE²、速度 WORLD_FIXTURE_SPEED 格/步、视距（切比雪夫）
 * WORLD_FIXTURE_RANGE：数字只是夹具参数。
 */
import { GamePhase } from "../../constants/game";
import { OBSERVER_SYNC_LIMITS } from "../../protocol/observerSync";
import { assertExactKeys, boundedString, finiteInteger, isPlainRecord, type PlainRecord, WireValidationError } from "../../protocol/http";
import { defineC2S, defineS2C } from "../defineGameplayWire";

export const WORLD_FIXTURE_MAP_SIZE = 1000;
export const WORLD_FIXTURE_SPEED = 2;
export const WORLD_FIXTURE_RANGE = 100;

export interface IWorldFixtureMoveReq {
    readonly dirX: number;
    readonly dirY: number;
    readonly seq: number;
}

export interface IWorldFixtureResyncReq {
    readonly [key: string]: never;
}

export interface IWorldFixturePos {
    readonly entityId: string;
    readonly x: number;
    readonly y: number;
    readonly seq: number;
    readonly tick: number;
}

export type WorldFixtureEntityKind = "mover" | "static";

/** 视野内可见投影（⛔ 无私有字段）。 */
export interface IWorldFixtureEntityWire {
    readonly id: string;
    readonly kind: WorldFixtureEntityKind;
    readonly x: number;
    readonly y: number;
    readonly rev: number;
}

export interface IWorldFixtureEnter {
    readonly seq: number;
    readonly tick: number;
    readonly entity: IWorldFixtureEntityWire;
}

export interface IWorldFixtureUpdate {
    readonly seq: number;
    readonly tick: number;
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly rev: number;
}

export interface IWorldFixtureLeave {
    readonly seq: number;
    readonly tick: number;
    readonly id: string;
}

/** 本人私有流：只发给该移动体 owner 的会话。 */
export interface IWorldFixturePrivate {
    readonly seq: number;
    readonly tick: number;
    readonly id: string;
    readonly stamina: number;
}

export interface IWorldFixtureBaselineBegin {
    readonly baselineId: string;
    readonly seq: number;
    readonly tick: number;
    readonly chunkCount: number;
    readonly itemCount: number;
}

export interface IWorldFixtureBaselineChunk {
    readonly baselineId: string;
    readonly seq: number;
    readonly index: number;
    readonly items: readonly IWorldFixtureEntityWire[];
}

/** 传送门（MMO MF8）：请求把本会话交接到 toMap / toLine（框架 context.transfer.request）。 */
export interface IWorldFixturePortalReq {
    toMap: string;
    toLine?: number;
}

/** 交接就绪（MMO MF8，perSession）：Committed 后由夹具发给发起会话；ticket 原文只此一处出网。 */
export interface IWorldFixtureTransfer {
    transferId: string;
    worldAddress: string;
    ticket: string;
    expiresAt: number;
}

export interface IWorldFixtureBaselineEnd {
    readonly baselineId: string;
    readonly seq: number;
    readonly checksum: string;
}

function recordOf(input: unknown, path: string): PlainRecord {
    if (!isPlainRecord(input)) throw new WireValidationError("MESSAGE_OBJECT", path);
    return input;
}

function kindOf(value: unknown, path: string): WorldFixtureEntityKind {
    if (value !== "mover" && value !== "static") throw new WireValidationError("MESSAGE_FIELD_RANGE", path);
    return value;
}

function entityOf(input: unknown, path: string): IWorldFixtureEntityWire {
    const value = recordOf(input, path);
    assertExactKeys(value, ["id", "kind", "x", "y", "rev"], [], path);
    return {
        id: boundedString(value.id, `${path}.id`, 1, 64),
        kind: kindOf(value.kind, `${path}.kind`),
        x: finiteInteger(value.x, `${path}.x`, 0, WORLD_FIXTURE_MAP_SIZE),
        y: finiteInteger(value.y, `${path}.y`, 0, WORLD_FIXTURE_MAP_SIZE),
        rev: finiteInteger(value.rev, `${path}.rev`, 0, Number.MAX_SAFE_INTEGER),
    };
}

function envelopeOf(value: PlainRecord, path: string): { readonly seq: number; readonly tick: number } {
    return {
        seq: finiteInteger(value.seq, `${path}.seq`, 1, Number.MAX_SAFE_INTEGER),
        tick: finiteInteger(value.tick, `${path}.tick`, 0, Number.MAX_SAFE_INTEGER),
    };
}

function validateMove(input: unknown): IWorldFixtureMoveReq {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["dirX", "dirY", "seq"], [], "payload");
    return {
        dirX: finiteInteger(value.dirX, "payload.dirX", -1, 1),
        dirY: finiteInteger(value.dirY, "payload.dirY", -1, 1),
        seq: finiteInteger(value.seq, "payload.seq", 0, Number.MAX_SAFE_INTEGER),
    };
}

function validateResync(input: unknown): IWorldFixtureResyncReq {
    const value = recordOf(input, "payload");
    assertExactKeys(value, [], [], "payload");
    return {};
}

function validatePos(input: unknown): IWorldFixturePos {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["entityId", "x", "y", "seq", "tick"], [], "payload");
    return {
        entityId: boundedString(value.entityId, "payload.entityId", 1, 64),
        x: finiteInteger(value.x, "payload.x", 0, WORLD_FIXTURE_MAP_SIZE),
        y: finiteInteger(value.y, "payload.y", 0, WORLD_FIXTURE_MAP_SIZE),
        seq: finiteInteger(value.seq, "payload.seq", 0, Number.MAX_SAFE_INTEGER),
        tick: finiteInteger(value.tick, "payload.tick", 0, Number.MAX_SAFE_INTEGER),
    };
}

function validateEnter(input: unknown): IWorldFixtureEnter {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["seq", "tick", "entity"], [], "payload");
    return { ...envelopeOf(value, "payload"), entity: entityOf(value.entity, "payload.entity") };
}

function validateUpdate(input: unknown): IWorldFixtureUpdate {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["seq", "tick", "id", "x", "y", "rev"], [], "payload");
    return {
        ...envelopeOf(value, "payload"),
        id: boundedString(value.id, "payload.id", 1, 64),
        x: finiteInteger(value.x, "payload.x", 0, WORLD_FIXTURE_MAP_SIZE),
        y: finiteInteger(value.y, "payload.y", 0, WORLD_FIXTURE_MAP_SIZE),
        rev: finiteInteger(value.rev, "payload.rev", 0, Number.MAX_SAFE_INTEGER),
    };
}

function validateLeave(input: unknown): IWorldFixtureLeave {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["seq", "tick", "id"], [], "payload");
    return { ...envelopeOf(value, "payload"), id: boundedString(value.id, "payload.id", 1, 64) };
}

function validatePrivate(input: unknown): IWorldFixturePrivate {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["seq", "tick", "id", "stamina"], [], "payload");
    return {
        ...envelopeOf(value, "payload"),
        id: boundedString(value.id, "payload.id", 1, 64),
        stamina: finiteInteger(value.stamina, "payload.stamina", 0, 1_000_000),
    };
}

function validateBaselineBegin(input: unknown): IWorldFixtureBaselineBegin {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["baselineId", "seq", "tick", "chunkCount", "itemCount"], [], "payload");
    return {
        baselineId: boundedString(value.baselineId, "payload.baselineId", 1, 160),
        ...envelopeOf(value, "payload"),
        chunkCount: finiteInteger(value.chunkCount, "payload.chunkCount", 0, 4096),
        itemCount: finiteInteger(value.itemCount, "payload.itemCount", 0, OBSERVER_SYNC_LIMITS.interestMaxEntities),
    };
}

function validateBaselineChunk(input: unknown): IWorldFixtureBaselineChunk {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["baselineId", "seq", "index", "items"], [], "payload");
    if (!Array.isArray(value.items) || value.items.length > OBSERVER_SYNC_LIMITS.baselineChunkItems) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.items");
    }
    return {
        baselineId: boundedString(value.baselineId, "payload.baselineId", 1, 160),
        seq: finiteInteger(value.seq, "payload.seq", 1, Number.MAX_SAFE_INTEGER),
        index: finiteInteger(value.index, "payload.index", 0, 4095),
        items: value.items.map((item, position) => entityOf(item, `payload.items[${position}]`)),
    };
}

function validateBaselineEnd(input: unknown): IWorldFixtureBaselineEnd {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["baselineId", "seq", "checksum"], [], "payload");
    return {
        baselineId: boundedString(value.baselineId, "payload.baselineId", 1, 160),
        seq: finiteInteger(value.seq, "payload.seq", 1, Number.MAX_SAFE_INTEGER),
        checksum: boundedString(value.checksum, "payload.checksum", 8, 8),
    };
}

function validatePortal(input: unknown): IWorldFixturePortalReq {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["toMap"], ["toLine"], "payload");
    const toMap = boundedString(value.toMap, "payload.toMap", 1, 64);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(toMap)) throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.toMap");
    const out: IWorldFixturePortalReq = { toMap };
    if (value.toLine !== undefined) out.toLine = finiteInteger(value.toLine, "payload.toLine", 0, 0xffff);
    return out;
}

function validateTransfer(input: unknown): IWorldFixtureTransfer {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["transferId", "worldAddress", "ticket", "expiresAt"], [], "payload");
    return {
        transferId: boundedString(value.transferId, "payload.transferId", 1, 64),
        worldAddress: boundedString(value.worldAddress, "payload.worldAddress", 1, 128),
        ticket: boundedString(value.ticket, "payload.ticket", 16, 128),
        expiresAt: finiteInteger(value.expiresAt, "payload.expiresAt", 0, Number.MAX_SAFE_INTEGER),
    };
}

export const WorldFixtureMove = defineC2S("c2s.worldFixture.move", validateMove, { phases: [GamePhase.Playing], rateCost: 1 });
export const WorldFixturePortal = defineC2S("c2s.worldFixture.portal", validatePortal, { phases: [GamePhase.Playing], rateCost: 4 });
export const WorldFixtureResync = defineC2S("c2s.worldFixture.resync", validateResync, { phases: [GamePhase.Playing], rateCost: 4 });
export const WorldFixturePos = defineS2C("s2c.worldFixture.pos", validatePos);
export const WorldFixtureEnter = defineS2C("s2c.worldFixture.enter", validateEnter, { perSession: true });
export const WorldFixtureUpdate = defineS2C("s2c.worldFixture.update", validateUpdate, { perSession: true, coalesceKey: "id" });
export const WorldFixtureLeave = defineS2C("s2c.worldFixture.leave", validateLeave, { perSession: true });
export const WorldFixturePrivate = defineS2C("s2c.worldFixture.private", validatePrivate, { perSession: true });
export const WorldFixtureBaselineBegin = defineS2C("s2c.worldFixture.baselineBegin", validateBaselineBegin, { perSession: true });
export const WorldFixtureBaselineChunk = defineS2C("s2c.worldFixture.baselineChunk", validateBaselineChunk, { perSession: true });
export const WorldFixtureBaselineEnd = defineS2C("s2c.worldFixture.baselineEnd", validateBaselineEnd, { perSession: true });
export const WorldFixtureTransfer = defineS2C("s2c.worldFixture.transfer", validateTransfer, { perSession: true });
