/**
 * MMO MF5a-B2 观察者同步原语（docs/MMO.md §4.3 / §5.4 MF5a；rooms/core/{InterestSet,ObserverSync,Baseline}.ts）：
 *  - 跨格：enter / leave 各恰一次，同 tick 内 leave → enter → update、各按 id 升序，同一会话单条单调 seq 流，会话间互不干扰；
 *  - 无变化不投递、版本号不动；rebase（baseline 之后）不投递且后续差分相对 baseline 集合；forget 后 seq / 视图重来；
 *  - 兴趣集与 chunk 上限只许收紧（§11.2）、超上限 fail-closed；三类 token 必须 perSession；
 *  - Baseline：Begin(chunkCount / itemCount) → Chunk(index 升序、每块 ≤ chunkItems) → End(checksum = wireChecksum(items))，
 *    baselineId = `<epoch>:baseline:<session>:<seq>`，空集合只发 Begin + End；
 *  - wireChecksum：键序无关、内容敏感、8 位十六进制。
 * 变异验证：ObserverSync 删 leave 分支 → 「跨格离开」转红；Baseline 不发 End → checksum 用例转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { defineS2C, OBSERVER_SYNC_LIMITS, wireChecksum, type GameplayS2CToken, type IObserverEnvelope } from "@game/shared";
import { Baseline } from "../src/rooms/core/Baseline";
import { InterestSet } from "../src/rooms/core/InterestSet";
import { ObserverSync, type ObservedEntity, type ObserverSyncSink } from "../src/rooms/core/ObserverSync";

interface FxEntity extends ObservedEntity { readonly x: number }
const identity = (input: unknown): Record<string, unknown> => input as Record<string, unknown>;
const TOKENS = {
    enter: defineS2C("s2c.fx.enter", identity, { perSession: true }),
    update: defineS2C("s2c.fx.update", identity, { perSession: true, coalesceKey: "id" }),
    leave: defineS2C("s2c.fx.leave", identity, { perSession: true }),
};
const BUILDERS = {
    enter: (entity: FxEntity, envelope: IObserverEnvelope) => ({ kind: "enter", id: entity.id, x: entity.x, seq: envelope.seq, tick: envelope.tick }),
    update: (entity: FxEntity, envelope: IObserverEnvelope) => ({ kind: "update", id: entity.id, x: entity.x, seq: envelope.seq, tick: envelope.tick }),
    leave: (entityId: string, envelope: IObserverEnvelope) => ({ kind: "leave", id: entityId, seq: envelope.seq, tick: envelope.tick }),
};

function recorder(): { readonly log: { session: string; type: string; payload: Record<string, unknown> }[]; readonly sink: ObserverSyncSink } {
    const log: { session: string; type: string; payload: Record<string, unknown> }[] = [];
    return {
        log,
        sink: { emit(session: string, token: GameplayS2CToken<unknown>, payload: unknown) { log.push({ session, type: token.type, payload: payload as Record<string, unknown> }); } },
    };
}
const entities = (...list: readonly (readonly [string, number, number])[]): ReadonlyMap<string, FxEntity> =>
    new Map(list.map(([id, rev, x]) => [id, { id, rev, x }]));
const brief = (log: { type: string; payload: Record<string, unknown> }[]): string[] =>
    log.map((entry) => `${entry.type.replace("s2c.fx.", "")}:${String(entry.payload.id)}@${String(entry.payload.seq)}`);

test("构造期：enter / update / leave 三个 token 必须 perSession", () => {
    const { sink } = recorder();
    assert.throws(() => new ObserverSync({ ...TOKENS, leave: defineS2C("s2c.fx.plainLeave", identity) }, BUILDERS, sink), /leave token 必须是 perSession/u);
    assert.doesNotThrow(() => new ObserverSync(TOKENS, BUILDERS, sink));
});

test("跨格：enter / leave 各恰一次；同 tick leave → enter → update 且按 id 升序；单 seq 流单调；会话互不干扰；无变化不投递", () => {
    const { log, sink } = recorder();
    const sync = new ObserverSync<FxEntity>(TOKENS, BUILDERS, sink);
    const first = sync.diffAndEmit("s1", entities(["b", 1, 0], ["a", 1, 0]), 1);
    assert.deepEqual(first, { entered: ["a", "b"], updated: [], left: [] });
    assert.deepEqual(brief(log), ["enter:a@1", "enter:b@2"]);
    assert.equal(log[0]?.payload.tick, 1);

    log.length = 0;
    const second = sync.diffAndEmit("s1", entities(["c", 1, 5], ["b", 2, 9]), 2);
    assert.deepEqual(second, { entered: ["c"], updated: ["b"], left: ["a"] });
    assert.deepEqual(brief(log), ["leave:a@3", "enter:c@4", "update:b@5"], "同 tick 内 leave → enter → update，seq 单调续接");
    assert.equal(log[2]?.payload.x, 9, "update 携带变化后的投影");
    assert.equal(sync.interest.version("s1"), 2);

    log.length = 0;
    const third = sync.diffAndEmit("s1", entities(["c", 1, 5], ["b", 2, 9]), 3);
    assert.deepEqual(third, { entered: [], updated: [], left: [] });
    assert.deepEqual(log, [], "无变化 ⛔ 不投递");
    assert.equal(sync.interest.version("s1"), 2, "无变化版本号不动");
    assert.equal(sync.seq("s1"), 5);

    const other = sync.diffAndEmit("s2", entities(["c", 1, 5]), 3);
    assert.deepEqual(other.entered, ["c"]);
    assert.deepEqual(brief(log), ["enter:c@1"], "另一会话从自己的 seq 1 起");
    assert.equal(sync.seq("s1"), 5, "s2 的投递不推进 s1 的 seq");
});

test("rebase（baseline 之后）不投递，后续差分相对 baseline 集合；forget 后视图与 seq 重来", () => {
    const { log, sink } = recorder();
    const sync = new ObserverSync<FxEntity>(TOKENS, BUILDERS, sink);
    sync.diffAndEmit("s1", entities(["a", 1, 0]), 1);
    log.length = 0;
    sync.rebase("s1", entities(["x", 1, 0], ["y", 1, 0]));
    assert.deepEqual(log, [], "rebase ⛔ 不投递");
    const diff = sync.diffAndEmit("s1", entities(["x", 2, 1], ["y", 1, 0]), 2);
    assert.deepEqual(diff, { entered: [], updated: ["x"], left: [] }, "差分相对 baseline 集合（a 不再 leave，y 不再 enter）");
    assert.deepEqual(brief(log), ["update:x@2"], "seq 续接 baseline 之前的流");

    sync.forget("s1");
    log.length = 0;
    assert.equal(sync.seq("s1"), 0);
    sync.diffAndEmit("s1", entities(["x", 2, 1]), 3);
    assert.deepEqual(brief(log), ["enter:x@1"], "最终离开后重来：视图空、seq 从 1 起");
});

test("兴趣集上限：只许收紧、超上限 fail-closed、实体键与 id 必须一致", () => {
    assert.throws(() => new InterestSet(OBSERVER_SYNC_LIMITS.interestMaxEntities + 1), RangeError);
    assert.throws(() => new InterestSet(0), RangeError);
    const set = new InterestSet(2);
    assert.throws(() => set.replace("s1", new Map([["a", 1], ["b", 1], ["c", 1]])), /超过上限 2/u);
    assert.equal(set.version("s1"), 0, "超限的替换不落地");
    const { sink } = recorder();
    const sync = new ObserverSync<FxEntity>(TOKENS, BUILDERS, sink);
    assert.throws(() => sync.diffAndEmit("s1", new Map([["a", { id: "b", rev: 1, x: 0 }]]), 1), /实体键 a 与 entity.id b 不一致/u);
});

const BASELINE_TOKENS = {
    begin: defineS2C("s2c.fx.baselineBegin", identity, { perSession: true }),
    chunk: defineS2C("s2c.fx.baselineChunk", identity, { perSession: true }),
    end: defineS2C("s2c.fx.baselineEnd", identity, { perSession: true }),
};
const BASELINE_BUILDERS = {
    begin: (meta: { baselineId: string; seq: number; tick: number; chunkCount: number; itemCount: number }) => ({ ...meta }),
    chunk: (meta: { baselineId: string; seq: number; index: number; items: readonly FxEntity[] }) => ({ baselineId: meta.baselineId, seq: meta.seq, index: meta.index, items: meta.items }),
    end: (meta: { baselineId: string; seq: number; checksum: string }) => ({ baselineId: meta.baselineId, seq: meta.seq, checksum: meta.checksum }),
};

test("Baseline：Begin → Chunk（index 升序、每块 ≤ chunkItems）→ End（checksum）；baselineId 形制；空集合只发 Begin + End；seq 来自单流", () => {
    const { log, sink } = recorder();
    const sync = new ObserverSync<FxEntity>(TOKENS, BUILDERS, sink);
    const baseline = new Baseline<FxEntity>(BASELINE_TOKENS, BASELINE_BUILDERS, sink, { chunkItems: 2 });
    sync.diffAndEmit("s1", entities(["a", 1, 0]), 1); // seq 1
    log.length = 0;
    const items: FxEntity[] = [{ id: "a", rev: 1, x: 0 }, { id: "b", rev: 1, x: 1 }, { id: "c", rev: 1, x: 2 }, { id: "d", rev: 1, x: 3 }, { id: "e", rev: 1, x: 4 }];
    const receipt = baseline.send("s1", items, { epochId: "epoch-7", seq: sync.nextSeq("s1"), tick: 4 });
    assert.deepEqual(receipt, { baselineId: "epoch-7:baseline:s1:2", seq: 2, chunkCount: 3, itemCount: 5, checksum: wireChecksum(items) });
    assert.deepEqual(log.map((entry) => entry.type), [
        "s2c.fx.baselineBegin", "s2c.fx.baselineChunk", "s2c.fx.baselineChunk", "s2c.fx.baselineChunk", "s2c.fx.baselineEnd",
    ]);
    assert.deepEqual(log[0]?.payload, { baselineId: "epoch-7:baseline:s1:2", epochId: "epoch-7", seq: 2, tick: 4, chunkCount: 3, itemCount: 5 });
    assert.deepEqual(log.slice(1, 4).map((entry) => [entry.payload.index, (entry.payload.items as FxEntity[]).map((item) => item.id)]), [[0, ["a", "b"]], [1, ["c", "d"]], [2, ["e"]]]);
    assert.deepEqual(log[4]?.payload, { baselineId: "epoch-7:baseline:s1:2", seq: 2, checksum: wireChecksum(items) });
    assert.ok(log.every((entry) => entry.session === "s1"));
    sync.rebase("s1", new Map(items.map((item) => [item.id, item])));
    log.length = 0;
    assert.deepEqual(sync.diffAndEmit("s1", new Map(items.map((item) => [item.id, item])), 5), { entered: [], updated: [], left: [] }, "baseline 后同集合零差分");

    log.length = 0;
    const empty = baseline.send("s1", [], { epochId: "epoch-7", seq: sync.nextSeq("s1"), tick: 6 });
    assert.equal(empty.chunkCount, 0);
    assert.deepEqual(log.map((entry) => entry.type), ["s2c.fx.baselineBegin", "s2c.fx.baselineEnd"]);

    assert.throws(() => baseline.send("s1", items, { epochId: "epoch-7", seq: 0, tick: 1 }), /seq 必须 ≥ 1/u);
    assert.throws(() => baseline.send("s1", items, { epochId: "", seq: 9, tick: 1 }), /epochId 必须非空/u);
    assert.throws(() => new Baseline(BASELINE_TOKENS, BASELINE_BUILDERS, sink, { chunkItems: OBSERVER_SYNC_LIMITS.baselineChunkItems + 1 }), RangeError);
    assert.throws(() => new Baseline({ ...BASELINE_TOKENS, end: defineS2C("s2c.fx.plainEnd", identity) }, BASELINE_BUILDERS, sink), /baseline end token 必须是 perSession/u);
});

test("wireChecksum：键序无关、内容与数组序敏感、8 位十六进制", () => {
    const left = wireChecksum({ b: [1, { y: 2, x: 1 }], a: "s" });
    const right = wireChecksum({ a: "s", b: [1, { x: 1, y: 2 }] });
    assert.equal(left, right);
    assert.match(left, /^[0-9a-f]{8}$/u);
    assert.notEqual(wireChecksum({ a: 1 }), wireChecksum({ a: 2 }));
    assert.notEqual(wireChecksum([1, 2]), wireChecksum([2, 1]));
});
