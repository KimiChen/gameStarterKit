/**
 * viewFixture（MMO MF5a-B5 观察者同步夹具，docs/MMO.md §4.3 / §5.4 MF5a）的 wire：
 *  - C2S：`look`（移动视口）、`resync`（客户端请求重发 baseline）；
 *  - S2C（全部 perSession）：视野流 `enter`（完整投影）/ `update`（变化投影，按 id 合并）/ `leave`（id）、本人私有流 `private`
 *    （⛔ 不进 enter / update / baseline——私有字段对他人零泄露的判据）、只含兴趣集的 baseline 三件。
 * 地图 1000×1000、视距（切比雪夫）100：数字只是夹具参数。
 */
import { GamePhase } from "../../constants/game";
import { OBSERVER_SYNC_LIMITS } from "../../protocol/observerSync";
import { assertExactKeys, boundedString, finiteInteger, isPlainRecord, type PlainRecord, WireValidationError } from "../../protocol/http";
import { defineC2S, defineS2C } from "../defineGameplayWire";

export const VIEW_FIXTURE_MAP_SIZE = 1000;
export const VIEW_FIXTURE_RANGE = 100;

export interface IViewFixtureLookReq {
    readonly x: number;
    readonly y: number;
}

export interface IViewFixtureResyncReq {
    readonly [key: string]: never;
}

/** 视野内可见投影（⛔ 无私有字段）。 */
export interface IViewFixtureEntityWire {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly rev: number;
}

export interface IViewFixtureEnter {
    readonly seq: number;
    readonly tick: number;
    readonly entity: IViewFixtureEntityWire;
}

export interface IViewFixtureUpdate {
    readonly seq: number;
    readonly tick: number;
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly rev: number;
}

export interface IViewFixtureLeave {
    readonly seq: number;
    readonly tick: number;
    readonly id: string;
}

/** 本人私有流：只发给该实体 owner 的会话。 */
export interface IViewFixturePrivate {
    readonly seq: number;
    readonly tick: number;
    readonly id: string;
    readonly note: string;
}

export interface IViewFixtureBaselineBegin {
    readonly baselineId: string;
    readonly seq: number;
    readonly tick: number;
    readonly chunkCount: number;
    readonly itemCount: number;
}

export interface IViewFixtureBaselineChunk {
    readonly baselineId: string;
    readonly seq: number;
    readonly index: number;
    readonly items: readonly IViewFixtureEntityWire[];
}

export interface IViewFixtureBaselineEnd {
    readonly baselineId: string;
    readonly seq: number;
    readonly checksum: string;
}

function recordOf(input: unknown, path: string): PlainRecord {
    if (!isPlainRecord(input)) throw new WireValidationError("MESSAGE_OBJECT", path);
    return input;
}

function entityOf(input: unknown, path: string): IViewFixtureEntityWire {
    const value = recordOf(input, path);
    assertExactKeys(value, ["id", "x", "y", "rev"], [], path);
    return {
        id: boundedString(value.id, `${path}.id`, 1, 64),
        x: finiteInteger(value.x, `${path}.x`, 0, VIEW_FIXTURE_MAP_SIZE),
        y: finiteInteger(value.y, `${path}.y`, 0, VIEW_FIXTURE_MAP_SIZE),
        rev: finiteInteger(value.rev, `${path}.rev`, 0, Number.MAX_SAFE_INTEGER),
    };
}

function envelopeOf(value: PlainRecord, path: string): { readonly seq: number; readonly tick: number } {
    return {
        seq: finiteInteger(value.seq, `${path}.seq`, 1, Number.MAX_SAFE_INTEGER),
        tick: finiteInteger(value.tick, `${path}.tick`, 0, Number.MAX_SAFE_INTEGER),
    };
}

function validateLook(input: unknown): IViewFixtureLookReq {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["x", "y"], [], "payload");
    return {
        x: finiteInteger(value.x, "payload.x", 0, VIEW_FIXTURE_MAP_SIZE),
        y: finiteInteger(value.y, "payload.y", 0, VIEW_FIXTURE_MAP_SIZE),
    };
}

function validateResync(input: unknown): IViewFixtureResyncReq {
    const value = recordOf(input, "payload");
    assertExactKeys(value, [], [], "payload");
    return {};
}

function validateEnter(input: unknown): IViewFixtureEnter {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["seq", "tick", "entity"], [], "payload");
    return { ...envelopeOf(value, "payload"), entity: entityOf(value.entity, "payload.entity") };
}

function validateUpdate(input: unknown): IViewFixtureUpdate {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["seq", "tick", "id", "x", "y", "rev"], [], "payload");
    const entity = entityOf({ id: value.id, x: value.x, y: value.y, rev: value.rev }, "payload");
    return { ...envelopeOf(value, "payload"), ...entity };
}

function validateLeave(input: unknown): IViewFixtureLeave {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["seq", "tick", "id"], [], "payload");
    return { ...envelopeOf(value, "payload"), id: boundedString(value.id, "payload.id", 1, 64) };
}

function validatePrivate(input: unknown): IViewFixturePrivate {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["seq", "tick", "id", "note"], [], "payload");
    return {
        ...envelopeOf(value, "payload"),
        id: boundedString(value.id, "payload.id", 1, 64),
        note: boundedString(value.note, "payload.note", 0, 256),
    };
}

function validateBaselineBegin(input: unknown): IViewFixtureBaselineBegin {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["baselineId", "seq", "tick", "chunkCount", "itemCount"], [], "payload");
    return {
        baselineId: boundedString(value.baselineId, "payload.baselineId", 1, 160),
        ...envelopeOf(value, "payload"),
        chunkCount: finiteInteger(value.chunkCount, "payload.chunkCount", 0, 4096),
        itemCount: finiteInteger(value.itemCount, "payload.itemCount", 0, OBSERVER_SYNC_LIMITS.interestMaxEntities),
    };
}

function validateBaselineChunk(input: unknown): IViewFixtureBaselineChunk {
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

function validateBaselineEnd(input: unknown): IViewFixtureBaselineEnd {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["baselineId", "seq", "checksum"], [], "payload");
    return {
        baselineId: boundedString(value.baselineId, "payload.baselineId", 1, 160),
        seq: finiteInteger(value.seq, "payload.seq", 1, Number.MAX_SAFE_INTEGER),
        checksum: boundedString(value.checksum, "payload.checksum", 8, 8),
    };
}

export const ViewFixtureLook = defineC2S("c2s.viewFixture.look", validateLook, { phases: [GamePhase.Playing], rateCost: 1 });
export const ViewFixtureResync = defineC2S("c2s.viewFixture.resync", validateResync, { phases: [GamePhase.Playing], rateCost: 4 });
export const ViewFixtureEnter = defineS2C("s2c.viewFixture.enter", validateEnter, { perSession: true });
export const ViewFixtureUpdate = defineS2C("s2c.viewFixture.update", validateUpdate, { perSession: true, coalesceKey: "id" });
export const ViewFixtureLeave = defineS2C("s2c.viewFixture.leave", validateLeave, { perSession: true });
export const ViewFixturePrivate = defineS2C("s2c.viewFixture.private", validatePrivate, { perSession: true });
export const ViewFixtureBaselineBegin = defineS2C("s2c.viewFixture.baselineBegin", validateBaselineBegin, { perSession: true });
export const ViewFixtureBaselineChunk = defineS2C("s2c.viewFixture.baselineChunk", validateBaselineChunk, { perSession: true });
export const ViewFixtureBaselineEnd = defineS2C("s2c.viewFixture.baselineEnd", validateBaselineEnd, { perSession: true });
