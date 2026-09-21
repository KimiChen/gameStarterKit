/**
 * 编排只读面真MySQL回归：默认 withKitTx → mysql2 execute，覆盖LIMIT整数形态。
 * 空/最新/缺检查点、server-map-pack隔离、64条上限；奖励结果筛选、水位、有界limit。
 * 仅写随机前缀测试行，结束按精确instance_id清理，不触碰开发者现有分线。
 */
import "./env-setup";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { getPool, closeMysql } from "../../src/core/infra/mysql";
import { CHECKPOINTED_VARS_MAX_ROWS, listCheckpointedVars, pollGrantResults } from "../../src/kits/mmo/api/orchestration/index";
import { ORCH_MAX_EVENT_QUEUE } from "@game/shared/kits/mmo/api/orchestration/index";

const SID = 63031;
const OTHER_SID = 63032;
const PREFIX = `int-orch-${process.pid}-${randomUUID().slice(0, 8)}`;
const MAP = `${PREFIX}-map`;
const PACK = `${PREFIX}-pack`;
const ids = new Set<string>();
const instance = async (suffix: string, mapId = MAP, packId = PACK, sId = SID): Promise<string> => {
    const id = `${PREFIX}-${suffix}`;
    ids.add(id);
    await getPool().execute("INSERT INTO k_mmo_instance (server_id, instance_id, map_id, pack_id, pack_version) VALUES (?, ?, ?, ?, 1)", [sId, id, mapId, packId]);
    return id;
};
const checkpoint = async (instanceId: string, rev: number, tick: number, vars: Record<string, number>, packId = PACK, sId = SID) => {
    const envelope = JSON.stringify({ rev, snapshot: { orchestration: { packId, vars } } });
    await getPool().execute("INSERT INTO k_mmo_instance_checkpoint (server_id, instance_id, rev, tick, state_hash, envelope) VALUES (?, ?, ?, ?, ?, ?)", [sId, instanceId, rev, tick, "0".repeat(64), envelope]);
};
const eventId = (sId: number, seq: number, instanceId: string): string => `${PREFIX}-e-${sId}-${seq}-${instanceId.slice(-1)}`;
const event = async (instanceId: string, seq: number, kind: string, status: number, payload: unknown, sId = SID) => {
    ids.add(instanceId);
    await getPool().execute("INSERT INTO k_mmo_world_event (server_id, event_id, instance_id, seq, kind, status, payload, checkpoint_rev) VALUES (?, ?, ?, ?, ?, ?, ?, 0)", [sId, eventId(sId, seq, instanceId), instanceId, seq, kind, status, JSON.stringify(payload)]);
};

after(async () => {
    try {
        for (const id of ids) {
            for (const table of ["k_mmo_world_event", "k_mmo_instance_checkpoint", "k_mmo_instance"] as const) {
                await getPool().execute(`DELETE FROM ${table} WHERE server_id IN (?, ?) AND instance_id = ?`, [SID, OTHER_SID, id]);
            }
        }
    } finally { await closeMysql(); }
});

test("真实MySQL execute：listCheckpointedVars空/最新/缺检查点、server-map-pack隔离及LIMIT64", async () => {
    assert.deepEqual(await listCheckpointedVars(SID, MAP, PACK), [], "空图也必须实际prepare/execute成功");
    const a = await instance("a");
    const b = await instance("b");
    const c = await instance("c");
    const wrongMap = await instance("wrong-map", `${MAP}-other`);
    const wrongPack = await instance("wrong-pack", MAP, `${PACK}-other`);
    await instance("b", MAP, PACK, OTHER_SID);
    await checkpoint(b, 1, 100, { score: 1 });
    await checkpoint(b, 2, 200, { score: 2 });
    await checkpoint(c, 3, 300, { score: 999 }, `${PACK}-other`);
    await checkpoint(wrongMap, 10, 1000, { score: 10 });
    await checkpoint(wrongPack, 11, 1100, { score: 11 });
    await checkpoint(b, 99, 9900, { score: 99 }, PACK, OTHER_SID);
    assert.deepEqual(await listCheckpointedVars(SID, MAP, PACK), [
        { instanceId: a, rev: 0, tick: 0, vars: {} },
        { instanceId: b, rev: 2, tick: 200, vars: { score: 2 } },
        { instanceId: c, rev: 3, tick: 300, vars: {} },
    ]);
    const cappedMap = `${PREFIX}-capped`;
    const expected: string[] = [];
    for (let i = 0; i <= CHECKPOINTED_VARS_MAX_ROWS; i += 1) expected.push(await instance(`cap-${String(i).padStart(2, "0")}`, cappedMap));
    assert.deepEqual((await listCheckpointedVars(SID, cappedMap, PACK)).map((row) => row.instanceId), expected.slice(0, CHECKPOINTED_VARS_MAX_ROWS));
});

test("真实MySQL execute：pollGrantResults空结果、状态/类型/区服/分线/水位隔离；limit只接受1..256整数", async () => {
    const id = `${PREFIX}-rewards`;
    assert.deepEqual(await pollGrantResults(SID, id, 0), []);
    await event(id, 1, "grantItem", 1, { opId: "award-one" });
    await event(id, 2, "grantCurrency", 2, { opId: "award-two" });
    await event(id, 3, "lootClaimed", 1, { opId: "not-a-grant" });
    await event(id, 4, "grantItem", 0, { opId: "still-pending" });
    await event(id, 5, "grantItem", 1, {});
    await event(id, 6, "grantItem", 1, { opId: "award-six" });
    await event(id, 7, "grantItem", 1, { opId: "other-zone" }, OTHER_SID);
    await event(`${PREFIX}-other`, 8, "grantItem", 1, { opId: "other-instance" });
    assert.deepEqual(await pollGrantResults(SID, id, 0, 1), [{ seq: 1, opId: "award-one", ok: true }]);
    assert.deepEqual(await pollGrantResults(SID, id, 1, 2), [
        { seq: 2, opId: "award-two", ok: false, reason: "dead" },
        { seq: 5, opId: eventId(SID, 5, id), ok: true },
    ]);
    assert.deepEqual((await pollGrantResults(SID, id, 0, ORCH_MAX_EVENT_QUEUE)).map((row) => row.seq), [1, 2, 5, 6]);
    for (const invalid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, ORCH_MAX_EVENT_QUEUE + 1, "1 UNION SELECT" as unknown as number]) {
        await assert.rejects(pollGrantResults(SID, id, 0, invalid), RangeError);
    }
});
