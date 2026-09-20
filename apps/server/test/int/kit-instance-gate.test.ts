/**
 * 卸载 kit 的分线闸真栈核对（tools/plugin/instanceGate.ts；docs/MMO-PLAN.md MK4-B3）：真 `world_instance` 行 × 真 coord Redis 权威租约键 / 登记 HASH，
 * 走闸的**缺省连接**（MYSQL_URL / REDIS_COORD_URL）——单测里假连接答的 SQL / 键形在这里对真库、真键回归。
 *  - 在租 + 登记 mode=mmoWorld ⇒ mmo 拒、别的 kit 放行、`check` 告警点名同一分线；
 *  - HDEL mode ⇒ 无法归属 ⇒ 拒（fail-closed）；
 *  - DEL 租约（崩溃后过期形态，行 state 仍 active）⇒ 放行（⛔ 不按 state 判）。
 * 前置：本地 MySQL / Redis 栈（npm --workspace @game/server run stack）+ db:bootstrap；⚠ 本机若正跑着 mmo 世界房，「放行」两条会因真分线在租而红（闸正确）。
 * 与其他 int 文件一样只能单文件串行跑（--test-concurrency=1）。
 */
import "./env-setup"; // 必须第一个 import
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { kWorldFence, kWorldInfo, kWorldLease } from "../../src/core/infra/keys";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import { closeRedis, coordClient } from "../../src/core/infra/redisRoute";
import { SERVER_KIT_CATALOG } from "../../src/kits/catalog.generated";
import { assertKitInstancesStopped, defaultInstanceGateRedis, describeKitInstanceBacklog, inspectKitInstances } from "../../tools/plugin/instanceGate";
import { defaultOutboxConnection } from "../../tools/plugin/outboxGate";
import { assertRedisUp } from "./helpers";

const SID = 0;
const MAP_ID = `gate-${randomUUID().slice(0, 8)}`;
const INSTANCE_ID = `wi_gate_${randomUUID().slice(0, 12)}`;

after(async () => {
    await coordClient().unlink(kWorldLease(SID, INSTANCE_ID), kWorldFence(SID, INSTANCE_ID), kWorldInfo(SID, INSTANCE_ID));
    await getPool().execute("DELETE FROM world_instance WHERE server_id = ? AND instance_id = ?", [SID, INSTANCE_ID]);
    await closeRedis();
    await closeMysql();
});

test("真栈：在租 + 登记 mode ⇒ mmo 拒 / 别的 kit 放行 / check 告警；HDEL mode ⇒ 无法归属拒；DEL 租约（state 仍 active）⇒ 放行", async () => {
    await assertRedisUp();
    const pool = getPool();
    await pool.execute(
        "INSERT INTO world_instance (server_id, instance_id, map_id, line, authority_epoch, holder, state) VALUES (?, ?, ?, 0, 1, 'node-gate', 'active')",
        [SID, INSTANCE_ID, MAP_ID]);
    const redis = coordClient();
    await redis.set(kWorldLease(SID, INSTANCE_ID), "node-gate:1", "PX", 60_000);
    await redis.hset(kWorldInfo(SID, INSTANCE_ID), { seated: "0", capacity: "100", publicAddress: "", holder: "node-gate", mode: "mmoWorld", updatedAt: String(Date.now()) });
    await redis.pexpire(kWorldInfo(SID, INSTANCE_ID), 60_000);

    await assert.rejects(
        assertKitInstancesStopped({ kitId: "mmo", modeIds: ["mmoWorld"] }),
        new RegExp(`还有 1 条分线在该 kit 的 mode 下运行.*s0/${MAP_ID}/0 holder=node-gate mode=mmoWorld`, "u"),
        "真租约 + 真登记 ⇒ 拒",
    );
    await assertKitInstancesStopped({ kitId: "arena", modeIds: ["arenaCapture", "arenaDuel"] });
    const lines = await describeKitInstanceBacklog(["mmo"], SERVER_KIT_CATALOG);
    assert.ok(lines.some((line) => line.includes("kit \"mmo\" 有 1 条分线在运行") && line.includes(`s0/${MAP_ID}/0 holder=node-gate mode=mmoWorld`)), lines.join("\n"));

    await redis.hdel(kWorldInfo(SID, INSTANCE_ID), "mode");
    await assert.rejects(assertKitInstancesStopped({ kitId: "mmo", modeIds: ["mmoWorld"] }), /1 条在租分线无法归属 mode/u, "登记缺 mode fail-closed");

    await redis.del(kWorldLease(SID, INSTANCE_ID));
    const state = await assertKitInstancesStopped({ kitId: "mmo", modeIds: ["mmoWorld"] });
    assert.ok(state.scanned >= 1, "行还在（state=active）但无租约 ⇒ 不算运行中");
    const conn = await defaultOutboxConnection();
    const gateRedis = await defaultInstanceGateRedis();
    try {
        const inspected = await inspectKitInstances(conn, gateRedis, ["mmoWorld"]);
        assert.deepEqual([inspected.running, inspected.unattributed], [[], []]);
    } finally {
        await conn.end();
        await gateRedis.quit();
    }
});
