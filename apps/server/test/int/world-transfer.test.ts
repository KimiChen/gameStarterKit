/**
 * MMO MF8-B2 交接状态机真库回归（docs/MMO.md §5.4 MF8 / §10.2「源 / 目标在交接各阶段崩溃 ⇒ 查持久状态恢复」）：
 *  - requested → prepared → committed → activated → finalized 每步持久 CAS；同 transferId 重放同一步 ⇒ already（同一结果，⛔ 二次副作用）；
 *  - 同 persona 只一在途（UNIQUE active_key）：终态（finalized / cancelled）后才能再交接；
 *  - Committed 后 ⛔ 取消 / ⛔ 回源；凭据轮换只在 committed；activate 唯一一次（第二次 already）；
 *  - 预留到期 expireReservations 只清 Committed 前的过期行。
 * 前置：本地栈已启动且 db:bootstrap 已到 MF8-B1 形态（world_transfer 表）。⚠ int 文件只能单文件串行跑。
 * 变异验证：advance 删 `AND state IN (...)` 谓词 → 「Committed 后取消被拒 / activate 唯一」转红；INSERT 去 active_key='1' → 「一 persona 只一在途」转红。
 */
import "./env-setup"; // 必须第一个 import
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { TransferInFlightError, TransferStateError } from "../../src/core/errors";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import { closeRedis } from "../../src/core/infra/redisRoute";
import {
    activateTransfer, activeTransferOf, cancelIfStale, cancelTransfer, commitTransfer, expireReservations, finalizeTransfer, newTransferId, prepareTransfer,
    readTransfer, requestTransfer, rotateTransferTicket,
} from "../../src/rooms/core/transfer";
import { testUid } from "./helpers";

const S_ID = 0;
const ids: string[] = [];
const tid = (): string => { const id = newTransferId(); ids.push(id); return id; };
const personaOf = (name: string): string => `p_${testUid(name).replace(/[^A-Za-z0-9_]/gu, "").slice(-20)}_${name}`.slice(0, 64);
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

after(async () => {
    for (const id of ids) await getPool().execute("DELETE FROM world_transfer WHERE server_id = ? AND transfer_id = ?", [S_ID, id]);
    await closeRedis();
    await closeMysql();
});

test("world_transfer：全程 CAS + transferId 幂等重放 + 一 persona 只一在途 + Committed 后不取消 + activate 唯一一次", async () => {
    const alice = personaOf("alice");
    const id1 = tid();
    const now = Date.now();
    const first = await requestTransfer(S_ID, { transferId: id1, personaId: alice, fromInstance: "wi_a", toMap: "mapB", toLine: 0, payload: { gold: 5 } });
    assert.equal(first.outcome, "advanced");
    assert.deepEqual([first.row.state, first.row.active, first.row.payload, first.row.toInstance, first.row.ticketSha256], ["requested", true, { gold: 5 }, "", ""]);
    assert.equal((await requestTransfer(S_ID, { transferId: id1, personaId: alice, fromInstance: "wi_a", toMap: "mapB", toLine: 0 })).outcome, "already", "同 transferId 重放 ⇒ 同一结果");
    await assert.rejects(requestTransfer(S_ID, { transferId: id1, personaId: alice, fromInstance: "wi_a", toMap: "mapC", toLine: 0 }), TransferStateError, "同 transferId 不同内容 ⇒ 拒");
    const id2 = tid();
    await assert.rejects(requestTransfer(S_ID, { transferId: id2, personaId: alice, fromInstance: "wi_a", toMap: "mapB", toLine: 0 }), (error: unknown) => {
        assert.ok(error instanceof TransferInFlightError);
        assert.equal(error.transferId, id1, "报出在途的 transferId");
        return true;
    });
    assert.equal((await activeTransferOf(S_ID, alice))?.transferId, id1);
    // prepared
    const prepared = await prepareTransfer(S_ID, id1, { toInstance: "wi_b", reserveExpiresAt: now + 30_000 });
    assert.deepEqual([prepared.outcome, prepared.row.state, prepared.row.toInstance], ["advanced", "prepared", "wi_b"]);
    assert.ok(Math.abs((prepared.row.reserveExpiresAt ?? 0) - (now + 30_000)) <= 1_000, "预留到期落库（ms 精度）");
    assert.equal((await prepareTransfer(S_ID, id1, { toInstance: "wi_b", reserveExpiresAt: now + 30_000 })).outcome, "already");
    // committed
    const committed = await commitTransfer(S_ID, id1, { controlEpoch: 3, ticketSha256: SHA_A });
    assert.deepEqual([committed.outcome, committed.row.state, committed.row.controlEpoch, committed.row.ticketSha256], ["advanced", "committed", 3, SHA_A]);
    const replay = await commitTransfer(S_ID, id1, { controlEpoch: 9, ticketSha256: SHA_B });
    assert.deepEqual([replay.outcome, replay.row.controlEpoch, replay.row.ticketSha256], ["already", 3, SHA_A], "重放 commit 返回持久行，⛔ 覆盖");
    assert.equal((await prepareTransfer(S_ID, id1, { toInstance: "wi_b", reserveExpiresAt: now })).outcome, "already", "前置步骤重放 ⇒ already（状态已在其后）");
    await assert.rejects(cancelTransfer(S_ID, id1), TransferStateError, "Committed 后 ⛔ 取消");
    assert.equal(await rotateTransferTicket(S_ID, id1, SHA_B), true, "committed 内可轮换凭据");
    assert.equal((await readTransfer(S_ID, id1))?.ticketSha256, SHA_B);
    // activated：唯一一次
    const activated = await activateTransfer(S_ID, id1, { controlEpoch: 4 });
    assert.deepEqual([activated.outcome, activated.row.state, activated.row.controlEpoch], ["advanced", "activated", 4]);
    assert.equal((await activateTransfer(S_ID, id1, { controlEpoch: 5 })).outcome, "already", "第二次 activate ⇒ already（目标房据此拒第二个会话）");
    assert.equal((await readTransfer(S_ID, id1))?.controlEpoch, 4, "already ⛔ 改写");
    assert.equal(await rotateTransferTicket(S_ID, id1, SHA_A), false, "activated 后不再轮换");
    // finalized：释放在途槽
    const finalized = await finalizeTransfer(S_ID, id1);
    assert.deepEqual([finalized.outcome, finalized.row.state, finalized.row.active], ["advanced", "finalized", false]);
    assert.equal((await finalizeTransfer(S_ID, id1)).outcome, "already");
    assert.equal((await commitTransfer(S_ID, id1, { controlEpoch: 1, ticketSha256: SHA_A })).outcome, "already");
    assert.equal(await activeTransferOf(S_ID, alice), null);
    // 终态后可再交接；Committed 前可取消
    const id3 = tid();
    assert.equal((await requestTransfer(S_ID, { transferId: id3, personaId: alice, fromInstance: "wi_b", toMap: "mapA", toLine: 0 })).outcome, "advanced");
    const cancelled = await cancelTransfer(S_ID, id3);
    assert.deepEqual([cancelled.outcome, cancelled.row.state, cancelled.row.active], ["advanced", "cancelled", false]);
    assert.equal((await cancelTransfer(S_ID, id3)).outcome, "already");
    await assert.rejects(prepareTransfer(S_ID, id3, { toInstance: "wi_a", reserveExpiresAt: now }), TransferStateError, "cancelled 后不能前进");
    await assert.rejects(activateTransfer(S_ID, "wt_missing", { controlEpoch: 1 }), (error: unknown) => error instanceof TransferStateError && error.actual === null);
    assert.equal(await readTransfer(S_ID, "wt_missing"), null);
});

test("预留到期释放：只清 Committed 前且 reserve_expires_at 已过的在途行", async () => {
    const bob = personaOf("bob");
    const now = Date.now();
    const stale = tid();
    await requestTransfer(S_ID, { transferId: stale, personaId: bob, fromInstance: "wi_a", toMap: "mapB", toLine: 1 });
    await prepareTransfer(S_ID, stale, { toInstance: "wi_b", reserveExpiresAt: now - 5_000 });
    const carol = personaOf("carol");
    const fresh = tid();
    await requestTransfer(S_ID, { transferId: fresh, personaId: carol, fromInstance: "wi_a", toMap: "mapB", toLine: 1 });
    await prepareTransfer(S_ID, fresh, { toInstance: "wi_b", reserveExpiresAt: now + 60_000 });
    const dave = personaOf("dave");
    const committedStale = tid();
    await requestTransfer(S_ID, { transferId: committedStale, personaId: dave, fromInstance: "wi_a", toMap: "mapB", toLine: 1 });
    await prepareTransfer(S_ID, committedStale, { toInstance: "wi_b", reserveExpiresAt: now - 5_000 });
    await commitTransfer(S_ID, committedStale, { controlEpoch: 1, ticketSha256: SHA_A });
    assert.equal(await expireReservations(S_ID, now), 1, "只有 Committed 前的过期预留被释放");
    assert.deepEqual([(await readTransfer(S_ID, stale))?.state, (await readTransfer(S_ID, fresh))?.state, (await readTransfer(S_ID, committedStale))?.state], ["cancelled", "prepared", "committed"]);
    assert.equal(await activeTransferOf(S_ID, bob), null, "释放后 persona 可再交接");
    assert.equal(await expireReservations(S_ID, now), 0, "幂等");
});

test("MF11 R2-01 cancelIfStale：陈旧 requested（建行超过窗口）/ 预留到期 prepared ⇒ cancelled；新鲜行 / committed 不动", async () => {
    const eve = personaOf("eve");
    const now = Date.now();
    const fresh = tid();
    const freshRow = (await requestTransfer(S_ID, { transferId: fresh, personaId: eve, fromInstance: "wi_a", toMap: "mapB", toLine: 2 })).row;
    assert.ok(Math.abs(freshRow.createdAt - now) < 5_000, "createdAt 落库（ms）");
    assert.equal(await cancelIfStale(S_ID, freshRow, now, 30_000), false, "新鲜 requested 不动");
    await getPool().execute("UPDATE world_transfer SET created_at = NOW(3) - INTERVAL 5 MINUTE WHERE server_id = ? AND transfer_id = ?", [S_ID, fresh]);
    const aged = (await readTransfer(S_ID, fresh))!;
    assert.equal(await cancelIfStale(S_ID, aged, now, 30_000), true, "建行超过窗口 ⇒ cancelled");
    assert.equal((await readTransfer(S_ID, fresh))?.state, "cancelled");
    const prepared = tid();
    await requestTransfer(S_ID, { transferId: prepared, personaId: eve, fromInstance: "wi_a", toMap: "mapB", toLine: 2 });
    const live = (await prepareTransfer(S_ID, prepared, { toInstance: "wi_b", reserveExpiresAt: now + 60_000 })).row;
    assert.equal(await cancelIfStale(S_ID, live, now, 30_000), false, "预留未到期不动");
    const expiredRow = (await prepareTransfer(S_ID, prepared, { toInstance: "wi_b", reserveExpiresAt: now })).row; // already ⇒ 原行
    assert.equal(expiredRow.state, "prepared");
    await getPool().execute("UPDATE world_transfer SET reserve_expires_at = NOW(3) - INTERVAL 1 SECOND WHERE server_id = ? AND transfer_id = ?", [S_ID, prepared]);
    assert.equal(await cancelIfStale(S_ID, (await readTransfer(S_ID, prepared))!, now, 30_000), true, "预留到期 ⇒ cancelled");
    const committed = tid();
    await requestTransfer(S_ID, { transferId: committed, personaId: eve, fromInstance: "wi_a", toMap: "mapB", toLine: 2 });
    await prepareTransfer(S_ID, committed, { toInstance: "wi_b", reserveExpiresAt: now - 5_000 });
    await commitTransfer(S_ID, committed, { controlEpoch: 1, ticketSha256: SHA_A });
    assert.equal(await cancelIfStale(S_ID, (await readTransfer(S_ID, committed))!, now + 1_000_000, 30_000), false, "Committed 及之后 ⛔ 动");
    assert.equal((await readTransfer(S_ID, committed))?.state, "committed");
});
