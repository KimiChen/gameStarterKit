/**
 * MMO MF5a-B5 客户端 reconcile（logic/rooms/observer/ObserverReconciler + net/rooms/GameRoomTransport.bindObserverStream）：
 *  - baseline 拼块 + Begin 计数 + End checksum（共享 wireChecksum）通过才替换实体集并推进 cursor；缺块 / 错 checksum ⇒ resync；
 *  - enter / update / leave 必须紧接 cursor；无 baseline / seq 跳号 ⇒ resync（⛔ 不补洞）；私有流共用 seq；
 *  - bindObserverStream 把六个 S2C 绑到 sink，解绑后不再投递。
 * 变异验证：删 checksum 比对 → 「错 checksum ⇒ resync」转红；advance 不比 seq → 「跳号 ⇒ resync」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { wireChecksum } from "../src/shared/protocol/observerSync";
import { ObserverReconciler } from "../src/logic/rooms/observer/ObserverReconciler";
import { bindObserverStream } from "../src/net/rooms/GameRoomTransport";

interface Ent { readonly id: string; readonly x: number }
interface Enter { readonly seq: number; readonly entity: Ent }
interface Update { readonly seq: number; readonly id: string; readonly x: number }
interface Leave { readonly seq: number; readonly id: string }

function reconciler(): ObserverReconciler<Ent, Enter, Update, Leave> {
    return new ObserverReconciler<Ent, Enter, Update, Leave>({
        entityOfItem: (item) => item as Ent,
        entityOfEnter: (payload) => payload.entity,
        entityOfUpdate: (previous, payload) => ({ ...(previous ?? { id: payload.id, x: 0 }), x: payload.x }),
        idOfLeave: (payload) => payload.id,
    });
}
function baseline(r: ObserverReconciler<Ent, Enter, Update, Leave>, seq: number, items: Ent[], chunk = 2, checksum = wireChecksum(items)): string[] {
    const results: string[] = [];
    const chunks: Ent[][] = [];
    for (let offset = 0; offset < items.length; offset += chunk) chunks.push(items.slice(offset, offset + chunk));
    const baselineId = `epoch:baseline:s:${seq}`;
    results.push(r.acceptBaselineBegin({ baselineId, seq, chunkCount: chunks.length, itemCount: items.length }));
    chunks.forEach((c, index) => results.push(r.acceptBaselineChunk({ baselineId, seq, index, items: c })));
    results.push(r.acceptBaselineEnd({ baselineId, seq, checksum }));
    return results;
}
const ids = (r: ObserverReconciler<Ent, Enter, Update, Leave>): string[] => [...r.snapshot().keys()].sort();

test("baseline：拼块 + 计数 + checksum 通过才替换实体集；差分紧接 cursor；私有流共用 seq", () => {
    const r = reconciler();
    assert.equal(r.acceptEnter({ seq: 1, entity: { id: "a", x: 0 } }), "resync", "无 baseline 先 resync");
    assert.equal(r.failure, "no-baseline");
    assert.deepEqual(baseline(r, 3, [{ id: "a", x: 1 }, { id: "b", x: 2 }, { id: "c", x: 3 }]), ["applied", "applied", "applied", "applied"]);
    assert.deepEqual(ids(r), ["a", "b", "c"]);
    assert.equal(r.seq, 3);
    assert.equal(r.isSynced, true);
    assert.equal(r.needsResync, false);
    assert.equal(r.acceptPrivate({ seq: 4 }), "applied", "私有流推进 cursor");
    assert.equal(r.acceptEnter({ seq: 5, entity: { id: "d", x: 4 } }), "applied");
    assert.equal(r.acceptUpdate({ seq: 6, id: "a", x: 9 }), "applied");
    assert.equal(r.snapshot().get("a")?.x, 9);
    assert.equal(r.acceptLeave({ seq: 7, id: "b" }), "applied");
    assert.deepEqual(ids(r), ["a", "c", "d"]);
    assert.equal(r.acceptUpdate({ seq: 9, id: "a", x: 1 }), "resync", "跳号 ⇒ resync");
    assert.equal(r.failure, "seq-gap");
    assert.equal(r.needsResync, true);
    assert.equal(r.acceptUpdate({ seq: 8, id: "a", x: 1 }), "resync", "标记后继续拒，直到新 baseline");
    // 新 baseline 清标记并续接
    baseline(r, 12, [{ id: "z", x: 0 }]);
    assert.equal(r.needsResync, false);
    assert.deepEqual(ids(r), ["z"]);
    assert.equal(r.acceptLeave({ seq: 13, id: "nope" }), "resync", "未知实体 ⇒ resync");
});

test("baseline 反例：错 checksum / 缺块 / 乱 baselineId / 重复块 一律 resync 且不替换实体集", () => {
    const r = reconciler();
    baseline(r, 1, [{ id: "a", x: 1 }]);
    assert.deepEqual(ids(r), ["a"]);
    baseline(r, 2, [{ id: "b", x: 1 }], 2, "deadbeef");
    assert.equal(r.failure, "baseline-checksum");
    assert.deepEqual(ids(r), ["a"], "错 checksum ⛔ 不替换");
    assert.equal(r.acceptBaselineBegin({ baselineId: "x", seq: 3, chunkCount: 2, itemCount: 3 }), "applied");
    assert.equal(r.acceptBaselineChunk({ baselineId: "x", seq: 3, index: 0, items: [{ id: "c", x: 1 }, { id: "d", x: 1 }] }), "applied");
    assert.equal(r.acceptBaselineChunk({ baselineId: "x", seq: 3, index: 0, items: [] }), "resync", "重复块");
    assert.equal(r.acceptBaselineBegin({ baselineId: "y", seq: 4, chunkCount: 1, itemCount: 1 }), "applied");
    assert.equal(r.acceptBaselineEnd({ baselineId: "y", seq: 4, checksum: wireChecksum([]) }), "resync", "缺块");
    assert.equal(r.failure, "baseline-count");
    assert.equal(r.acceptBaselineBegin({ baselineId: "w", seq: 5, chunkCount: 1, itemCount: 1 }), "applied");
    assert.equal(r.acceptBaselineChunk({ baselineId: "other", seq: 5, index: 0, items: [{ id: "e", x: 1 }] }), "resync", "乱 baselineId");
    assert.deepEqual(ids(r), ["a"]);
    r.reset();
    assert.equal(r.isSynced, false);
    assert.equal(r.seq, 0);
});

test("bindObserverStream：六个 S2C 绑到 sink，按到达序投递，解绑后不再投递", () => {
    const handlers = new Map<string, (payload: unknown) => unknown>();
    const room = {
        onMessage(type: string, callback: (payload: unknown) => unknown) {
            handlers.set(type, callback);
            return () => { handlers.delete(type); };
        },
    } as unknown as Parameters<typeof bindObserverStream>[0];
    const r = reconciler();
    const log: string[] = [];
    const off = bindObserverStream(room, {
        enter: "s2c.viewFixture.enter", update: "s2c.viewFixture.update", leave: "s2c.viewFixture.leave",
        baselineBegin: "s2c.viewFixture.baselineBegin", baselineChunk: "s2c.viewFixture.baselineChunk", baselineEnd: "s2c.viewFixture.baselineEnd",
    }, {
        enter: (p) => log.push(`enter:${r.acceptEnter(p as Enter)}`),
        update: (p) => log.push(`update:${r.acceptUpdate(p as Update)}`),
        leave: (p) => log.push(`leave:${r.acceptLeave(p as Leave)}`),
        baselineBegin: (p) => log.push(`begin:${r.acceptBaselineBegin(p as never)}`),
        baselineChunk: (p) => log.push(`chunk:${r.acceptBaselineChunk(p as never)}`),
        baselineEnd: (p) => log.push(`end:${r.acceptBaselineEnd(p as never)}`),
    });
    assert.equal(handlers.size, 6);
    const items = [{ id: "a", x: 1 }];
    handlers.get("s2c.viewFixture.baselineBegin")!({ baselineId: "b1", seq: 1, chunkCount: 1, itemCount: 1 });
    handlers.get("s2c.viewFixture.baselineChunk")!({ baselineId: "b1", seq: 1, index: 0, items });
    handlers.get("s2c.viewFixture.baselineEnd")!({ baselineId: "b1", seq: 1, checksum: wireChecksum(items) });
    handlers.get("s2c.viewFixture.enter")!({ seq: 2, entity: { id: "b", x: 0 } });
    handlers.get("s2c.viewFixture.update")!({ seq: 3, id: "b", x: 5 });
    handlers.get("s2c.viewFixture.leave")!({ seq: 4, id: "a" });
    assert.deepEqual(log, ["begin:applied", "chunk:applied", "end:applied", "enter:applied", "update:applied", "leave:applied"]);
    assert.deepEqual(ids(r), ["b"]);
    off();
    assert.equal(handlers.size, 0, "解绑后不再投递");
});
