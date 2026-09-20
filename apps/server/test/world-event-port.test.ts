/**
 * MMO MF7b-B3 WorldEventPort 纯函数面（docs/MMO.md §7.3 原子规则）：
 *  - 认领 SQL 必含门 `e.checkpoint_rev <= w.checkpoint_rev`（与 world_instance JOIN）、只取 status 0 且 attempts < 上限、seq 升序、LIMIT 在 1..256；
 *  - supersede SQL：status 0 → 3 且 checkpoint_rev > 恢复点；
 *  - 表名闸；status 常量；限额常量只许收紧的形态。
 * 真库行为（认领 / 幂等 / 死信 / superseded）见 test/int/world-event-dedup.test.ts。
 * 变异验证：claimWorldEventsSql 删门 → 本文件「认领 SQL 必含门」转红（int「检查点未落库的事件不执行」同时转红）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    WORLD_EVENT_CLAIM_LIMIT_DEFAULT, WORLD_EVENT_CLAIM_LIMIT_MAX, WORLD_EVENT_MAX_ATTEMPTS, WORLD_EVENT_STATUS, assertWorldEventTable,
    assertWorldEventTableName, claimWorldEventsSql, supersedeWorldEventsSql,
} from "../src/rooms/core/WorldEventPort";

test("认领 SQL：JOIN world_instance 且门 checkpoint_rev ≤ 已落库 rev；只取 pending 且 attempts < 上限；seq 升序；LIMIT 范围；可按分线", () => {
    const sql = claimWorldEventsSql("k_kfix_event", false, 10);
    assert.match(sql, /JOIN world_instance w ON w\.server_id = e\.server_id AND w\.instance_id = e\.instance_id/u);
    assert.match(sql, /e\.checkpoint_rev <= w\.checkpoint_rev/u, "§7.3 ②：检查点未落库的事件 ⛔ 执行");
    assert.match(sql, /e\.status = 0 AND e\.attempts < \?/u);
    assert.match(sql, /ORDER BY e\.seq LIMIT 10 FOR UPDATE$/u);
    assert.doesNotMatch(sql, /e\.instance_id = \?/u);
    assert.match(claimWorldEventsSql("k_kfix_event", true, 1), /AND e\.instance_id = \? AND e\.status = 0/u);
    assert.throws(() => claimWorldEventsSql("k_kfix_event", false, 0), RangeError);
    assert.throws(() => claimWorldEventsSql("k_kfix_event", false, WORLD_EVENT_CLAIM_LIMIT_MAX + 1), RangeError);
    assert.ok(WORLD_EVENT_CLAIM_LIMIT_DEFAULT >= 1 && WORLD_EVENT_CLAIM_LIMIT_DEFAULT <= WORLD_EVENT_CLAIM_LIMIT_MAX);
    assert.ok(WORLD_EVENT_MAX_ATTEMPTS >= 1 && WORLD_EVENT_MAX_ATTEMPTS <= 10, "认领次数上限是小整数（死信同 outbox 口径）");
});

test("supersede SQL：pending 且 checkpoint_rev > 恢复点 ⇒ superseded(3)；status 常量；表名闸", () => {
    const sql = supersedeWorldEventsSql("k_kfix_event");
    assert.equal(sql, "UPDATE `k_kfix_event` SET status = 3 WHERE server_id = ? AND instance_id = ? AND status = 0 AND checkpoint_rev > ?");
    assert.deepEqual({ ...WORLD_EVENT_STATUS }, { Pending: 0, Done: 1, Dead: 2, Superseded: 3 });
    assert.equal(assertWorldEventTableName("k_kfix_world_event"), "k_kfix_world_event");
    for (const bad of ["world_instance", "kfix_event", "k_kfix_event; DROP", "k_", ""]) {
        assert.throws(() => assertWorldEventTableName(bad), TypeError, `表名 ${JSON.stringify(bad)} 拒`);
    }
    assert.equal(assertWorldEventTable("kfix", "k_kfix_event", ["k_kfix_event"]), "k_kfix_event");
    assert.throws(() => assertWorldEventTable("kfix", "k_kfix_tile", ["k_kfix_event"]), /world-event/u, "普通 kit 表 ⛔");
    assert.throws(() => assertWorldEventTable("kfix", "k_arena_event", ["k_kfix_event"]), /前缀/u, "别的 kit ⛔");
});
