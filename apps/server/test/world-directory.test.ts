/**
 * MMO MF10-B1 分线分配（docs/MMO.md §5.4 MF10「(sId, mapId) 满员开新 line；指定 line；WORLD_MAX_LINES_PER_MAP」）：
 * 假 SQL（内存行）+ MemoryWorldRegistry（权威房登记的 seated / capacity / publicAddress，带 TTL）。
 *  - allocate：按 line 升序取第一条未满（seated < capacity）；无登记 = 空实例；全满开第一条空缺线；到上限 ⇒ WorldLinesExhaustedError；
 *  - resolve 指定 line ≥ maxLines ⇒ WorldLineLimitError；缓存 id、行每次回读；
 *  - 登记 TTL 到期 ⇒ 视为空（崩溃自愈）；publicAddress 经登记读出。
 * 变异验证：allocate 忽略 maxLines（开新线不封顶）→「到上限拒」转红；resolve 删上限判断 →「指定 line 越界拒」转红；满员判定改 `<=` →「满员开新线」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { WorldLineLimitError, WorldLinesExhaustedError } from "../src/core/errors";
import type { WorldInstanceRow } from "../src/rooms/core/control";
import { WorldDirectory, type WorldDirectorySql } from "../src/rooms/core/WorldDirectory";
import { MemoryWorldRegistry } from "../src/rooms/core/WorldRegistry";

function fakeSql() {
    const rows = new Map<string, WorldInstanceRow>();
    const log: string[] = [];
    const sql: WorldDirectorySql = {
        async findOrCreateInstance(sId, mapId, line) {
            const key = `${sId}/${mapId}/${line}`;
            let row = rows.get(key);
            if (!row) {
                row = { instanceId: `wi_${mapId}_${line}`, mapId, line, authorityEpoch: 0, holder: "", state: "offline", checkpointRev: 0, writeSeq: 0 };
                rows.set(key, row);
                log.push(`create:${mapId}#${line}`);
            }
            return row;
        },
        async readInstance(sId, instanceId) {
            return [...rows.values()].find((row) => row.instanceId === instanceId && rows.has(`${sId}/${row.mapId}/${row.line}`)) ?? null;
        },
        async listInstances(sId, mapId) {
            return [...rows.entries()].filter(([key]) => key.startsWith(`${sId}/${mapId}/`)).map(([, row]) => row);
        },
    };
    return { sql, rows, log };
}

test("allocate：满员开新线、无登记视为空、TTL 到期自愈、到上限拒；resolve 指定 line 越界拒", async () => {
    const clock = { now: 1_000 };
    const registry = new MemoryWorldRegistry(() => clock.now, 30_000);
    const { sql, log } = fakeSql();
    const directory = new WorldDirectory(sql, { maxLines: 3, registry });
    const first = await directory.allocate(0, "m1", { capacity: 2 });
    assert.deepEqual([first.line, log], [0, ["create:m1#0"]], "无分线 ⇒ 开 0 号线");
    assert.equal((await directory.allocate(0, "m1", { capacity: 2 })).line, 0, "无登记 = 空实例，仍是 0 号线");
    await registry.publish(0, first.instanceId, { seated: 1, capacity: 2, publicAddress: "wss://a", holder: "node-a" });
    assert.equal((await directory.allocate(0, "m1", { capacity: 2 })).line, 0, "未满（1 < 2）");
    await registry.publish(0, first.instanceId, { seated: 2, capacity: 2, publicAddress: "wss://a", holder: "node-a" });
    const second = await directory.allocate(0, "m1", { capacity: 2 });
    assert.deepEqual([second.line, second.instanceId], [1, "wi_m1_1"], "满员 ⇒ 开 1 号线");
    await registry.publish(0, second.instanceId, { seated: 5, capacity: 2, publicAddress: "wss://b", holder: "node-b" });
    const third = await directory.allocate(0, "m1", { capacity: 2 });
    assert.equal(third.line, 2, "再满 ⇒ 2 号线（上限 3 内）");
    await registry.publish(0, third.instanceId, { seated: 2, capacity: 2, publicAddress: "wss://c", holder: "node-c" });
    await assert.rejects(directory.allocate(0, "m1", { capacity: 2 }), (error: unknown) => error instanceof WorldLinesExhaustedError && error.maxLines === 3, "全满且到上限 ⇒ 拒");
    // 登记 TTL 到期（权威房崩溃）⇒ 视为空实例，按 line 升序回到 0 号线
    clock.now += 30_001;
    assert.equal((await directory.allocate(0, "m1", { capacity: 2 })).line, 0, "登记过期 ⇒ 空实例可用");
    // 阈值按调用方：capacity 10 时 1 号线（seated 5）未满
    await registry.publish(0, first.instanceId, { seated: 2, capacity: 2, publicAddress: "wss://a", holder: "node-a" });
    await registry.publish(0, second.instanceId, { seated: 5, capacity: 2, publicAddress: "wss://b", holder: "node-b" });
    assert.equal((await directory.allocate(0, "m1", { capacity: 10 })).line, 0, "阈值放宽 ⇒ 0 号线未满");
    assert.equal((await directory.allocate(0, "m1", { capacity: 2 })).line, 2, "0 满（2 ≥ 2）、1 满（5 ≥ 2）、2 登记已过期 ⇒ 空");
    // 指定 line：上限内正常、越界拒
    assert.equal((await directory.resolve(0, "m1", 1)).instanceId, "wi_m1_1");
    await assert.rejects(directory.resolve(0, "m1", 3), (error: unknown) => error instanceof WorldLineLimitError && error.line === 3 && error.maxLines === 3);
    await assert.rejects(directory.resolve(0, "m1", -1), RangeError);
    // 另一张图独立计数；空缺线优先补（删掉 1 号线后再全满 ⇒ 先补 1）
    assert.equal((await directory.allocate(0, "m2", { capacity: 1 })).line, 0);
    assert.deepEqual((await registry.read(0, first.instanceId))?.publicAddress, "wss://a", "节点地址经登记读出");
    assert.throws(() => new WorldDirectory(sql, { maxLines: 0, registry }), RangeError);
});

// ── MF10-B1：权威房的分线登记（seated / capacity / publicAddress）：Active 起发布、入座 / 离座立即刷新、节拍刷新、Offline 撤销 ──────────
import { CloseCode } from "colyseus";
import { fakeClient, harness, join, joinOptions } from "./world-room.test";

test("WorldRoom 登记：Active 发布 0/capacity + 节点地址；入座 / 离座立即刷新；按 WORLD_INFO_REFRESH_MS 节拍刷新；dispose 撤销", async () => {
    const registry = new MemoryWorldRegistry(() => 0, 1_000_000);
    const h = harness({ capacity: 3, room: { registry, publicAddress: "wss://world-a.example.com" } });
    h.control.seedPersona("p_alice_0000000001", "u-alice");
    await h.room.onCreate(joinOptions());
    const key = "wi_m1_0";
    assert.deepEqual(registry.log, [`publish:${key}:0/3`], "Active 起发布");
    const info = await registry.read(0, key);
    assert.deepEqual([info?.seated, info?.capacity, info?.publicAddress, info?.holder], [0, 3, "wss://world-a.example.com", "node-a"]);
    const alice = fakeClient("sa", "p_alice_0000000001", "u-alice");
    await join(h.room, alice);
    assert.equal((await registry.read(0, key))?.seated, 1, "入座立即刷新");
    h.room.advance(50);
    assert.equal(registry.log.length, 2, "未到节拍不重复发布");
    h.clock.now += 5_000;
    h.room.advance(50);
    assert.equal(registry.log.length, 3, "到节拍（WORLD_INFO_REFRESH_MS）刷新");
    await h.room.onLeave(alice as never, CloseCode.CONSENTED);
    assert.equal((await registry.read(0, key))?.seated, 0, "离座立即刷新");
    await h.room.onDispose();
    assert.equal(await registry.read(0, key), null, "dispose 撤销登记");
    assert.ok(registry.log.includes(`forget:${key}`));
});
