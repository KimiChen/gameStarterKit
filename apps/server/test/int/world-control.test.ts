/**
 * MMO MF4-B3 世界权威 / 控制权真库回归（docs/MMO.md §4.6 不变量 1 / §5.4 MF4）：
 *  - findOrCreateInstance 幂等（同 (sId, mapId, line) 同一行；不同 line 不同行；并发建行只一行）；
 *  - acquireAuthority：两个持有者拿同一 expectedEpoch 争抢只一个成功（CAS +1），输家 WorldNotAuthoritativeError 带实际 epoch；
 *    setInstanceState 旧 epoch 0 行 ⇒ 拒；
 *  - acquireControl：同 persona 两处 join 只一个控制权；assertControl 旧 epoch ⇒ ControlConflictError；releaseControl 只有持有者能放。
 * 前置：本地栈已启动且 db:bootstrap 已到 MF4-B3 形态（world_instance 表）。⚠ int 文件只能单文件串行跑。
 * 变异验证：acquireAuthority / acquireControl 删 CAS 谓词 → 「双持有 / 双登」转红。
 */
import "./env-setup"; // 必须第一个 import
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { ControlConflictError, PersonaNotFoundError, WorldNotAuthoritativeError } from "../../src/core/errors";
import { withKitTx } from "../../src/core/infra/kitApi";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import { closeRedis } from "../../src/core/infra/redisRoute";
import {
    acquireAuthority, acquireControl, assertControl, findOrCreateInstance, readControl, readInstance, releaseControl, setInstanceState,
} from "../../src/rooms/core/control";
import { testUid } from "./helpers";

const S_ID = 0;
const uids: string[] = [];
const mapIds: string[] = [];
const uid = (n: string): string => { const u = testUid(n).slice(0, 32); uids.push(u); return u; };
const mapId = (n: string): string => { const m = `wc-${testUid(n).slice(-12)}-${n}`.slice(0, 48); mapIds.push(m); return m; };

after(async () => {
    for (const u of uids) await getPool().execute("DELETE FROM persona WHERE user_id = ?", [u]);
    for (const m of mapIds) await getPool().execute("DELETE FROM world_instance WHERE server_id = ? AND map_id = ?", [S_ID, m]);
    await closeRedis();
    await closeMysql();
});

test("world_instance：findOrCreateInstance 幂等 / 并发只一行；acquireAuthority CAS 只一个赢家；旧 epoch 的状态写被拒", async () => {
    const m = mapId("auth");
    const [first, second] = await Promise.all([findOrCreateInstance(S_ID, m, 1), findOrCreateInstance(S_ID, m, 1)]);
    assert.equal(first.instanceId, second.instanceId, "并发建行只一行（UNIQUE 撞车回读赢家）");
    assert.deepEqual([first.authorityEpoch, first.state, first.line, first.writeSeq], [0, "offline", 1, 0]);
    const other = await findOrCreateInstance(S_ID, m, 2);
    assert.notEqual(other.instanceId, first.instanceId, "不同 line 不同实例");
    assert.equal((await findOrCreateInstance(S_ID, m, 1)).instanceId, first.instanceId);

    const results = await Promise.allSettled([
        acquireAuthority(S_ID, first.instanceId, "node-a", 0),
        acquireAuthority(S_ID, first.instanceId, "node-b", 0),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    assert.equal(won.length, 1, "同一 expectedEpoch 只一个赢家");
    assert.equal((won[0] as PromiseFulfilledResult<number>).value, 1);
    assert.ok((lost[0] as PromiseRejectedResult).reason instanceof WorldNotAuthoritativeError);
    assert.equal(((lost[0] as PromiseRejectedResult).reason as WorldNotAuthoritativeError).actualEpoch, 1, "输家拿到实际 epoch");
    const row = await readInstance(S_ID, first.instanceId);
    assert.equal(row?.authorityEpoch, 1);
    assert.equal(row?.state, "recovering");
    assert.ok(row?.holder === "node-a" || row?.holder === "node-b");

    await setInstanceState(S_ID, first.instanceId, 1, "active");
    assert.equal((await readInstance(S_ID, first.instanceId))?.state, "active");
    await assert.rejects(setInstanceState(S_ID, first.instanceId, 0, "draining"), WorldNotAuthoritativeError, "旧 epoch 的延迟写 0 行");
    // 顶替：新持有者以当前 epoch 1 取权威 → 2；旧持有者（epoch 1）之后的写全部被拒
    assert.equal(await acquireAuthority(S_ID, first.instanceId, "node-c", 1), 2);
    await assert.rejects(setInstanceState(S_ID, first.instanceId, 1, "active"), WorldNotAuthoritativeError);
    await assert.rejects(acquireAuthority(S_ID, first.instanceId, "node-a", 1), WorldNotAuthoritativeError, "过期的 expectedEpoch 再取权威也拒");
    assert.equal(await readInstance(S_ID, "wi_missing"), null);
});

test("persona 控制权：同 persona 两处 join 只一个控制权；assertControl 旧 epoch 拒；releaseControl 只有持有者能放", async () => {
    const u = uid("ctl");
    const personaId = await withKitTx("arena", S_ID, (tx) => tx.createPersona(u, 0));
    assert.deepEqual(await readControl(S_ID, personaId), { controlEpoch: 0, worldAddress: null });
    const results = await Promise.allSettled([
        acquireControl(S_ID, personaId, "s0/m1/1", 0),
        acquireControl(S_ID, personaId, "s0/m1/2", 0),
    ]);
    const won = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<number>[];
    const lost = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    assert.equal(won.length, 1, "双登只一个控制权");
    assert.equal(won[0]?.value, 1);
    assert.ok(lost[0]?.reason instanceof ControlConflictError);
    assert.equal((lost[0]?.reason as ControlConflictError).actualEpoch, 1);
    const control = await readControl(S_ID, personaId);
    assert.equal(control?.controlEpoch, 1);
    assert.ok(control?.worldAddress === "s0/m1/1" || control?.worldAddress === "s0/m1/2");

    await assertControl(S_ID, personaId, 1);
    await assert.rejects(assertControl(S_ID, personaId, 0), ControlConflictError, "旧 epoch 的延迟提交 0 行");
    await assert.rejects(assertControl(S_ID, "p_missing_0123456789", 0), PersonaNotFoundError);
    assert.equal(await releaseControl(S_ID, personaId, 0), false, "旧 epoch 不能放别人的控制权");
    assert.equal(await releaseControl(S_ID, personaId, 1), true);
    assert.deepEqual(await readControl(S_ID, personaId), { controlEpoch: 1, worldAddress: null });
    // 交接 / 再登录：以当前 epoch 1 取 ⇒ 2，旧持有者（1）从此被拒
    assert.equal(await acquireControl(S_ID, personaId, "s0/m2/1", 1), 2);
    await assert.rejects(assertControl(S_ID, personaId, 1), ControlConflictError);
    await assert.rejects(acquireControl(S_ID, "p_missing_0123456789", "s0/m1/1", 0), PersonaNotFoundError);
});
