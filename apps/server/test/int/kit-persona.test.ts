/**
 * MF2-B4 persona 门面真库回归（docs/MMO.md MF2 退出条件）：真实 MySQL（本地 dev 库已 db:bootstrap 到 MF2 形态）。
 *  - 同一 withKitTx 内 createPersona + 自有写，任一失败整体回滚（persona 行不落）；
 *  - 同槽二建 ⇒ PersonaSlotTakenError（UNIQUE 是存储边界）；超硬上限槽位拒；
 *  - 旧 control_epoch 延迟提交 0 行 ⇒ ControlConflictError（MF4 抬高 epoch 的写在此被拒）；
 *  - 乱序锁反例被消：同事务内 B 后 A 在触库前拒，两事务各自升序不互卡；
 *  - deactivate → delete 生命周期；listPersonas 事务外只读。
 * 前置：本地栈已启动且 db:bootstrap 已跑到 MF2 形态。⚠ int 文件只能单文件串行跑。
 */
import "./env-setup"; // 必须第一个 import
import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  ControlConflictError, PersonaBusyError, PersonaLockOrderError, PersonaSlotTakenError, listPersonas, withKitTx,
} from "../../src/core/infra/kitApi";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import { closeRedis } from "../../src/core/infra/redisRoute";
import type { RowDataPacket } from "../../src/core/infra/mysql";
import { testUid } from "./helpers";

const KIT = "arena";
const S_ID = 0;
const uids: string[] = [];
const uid = (n: string): string => { const u = testUid(n).slice(0, 32); uids.push(u); return u; };

after(async () => {
  for (const u of uids) await getPool().execute("DELETE FROM persona WHERE user_id = ?", [u]);
  await closeRedis();
  await closeMysql();
});

test("persona 门面：建角 / 列表 / 同槽冲突 / 硬上限 / 整体回滚", async () => {
  const u = uid("persona-a");
  const [p0, p1] = await withKitTx(KIT, S_ID, async (tx) => [await tx.createPersona(u, 0, { name: "Ann" }), await tx.createPersona(u, 1)]);
  const list = await listPersonas(KIT, u, S_ID);
  assert.deepEqual(list.map((p) => [p.personaId, p.slot, p.status, p.controlEpoch, p.worldAddress]), [[p0, 0, 0, 0, null], [p1, 1, 0, 0, null]]);
  assert.deepEqual(list[0]?.meta, { name: "Ann" });
  await assert.rejects(withKitTx(KIT, S_ID, (tx) => tx.createPersona(u, 1)), PersonaSlotTakenError, "同槽二建被 UNIQUE 拒");
  await assert.rejects(withKitTx(KIT, S_ID, (tx) => tx.createPersona(u, 16)), RangeError, "≥ PERSONA_MAX_SLOTS_HARD 拒");
  // 同一事务内 createPersona 之后的自有写失败 ⇒ 整体回滚，persona 行不落
  await assert.rejects(withKitTx(KIT, S_ID, async (tx) => { await tx.createPersona(u, 2); throw new Error("kit 自有角色行写失败"); }), /写失败/u);
  assert.equal((await listPersonas(KIT, u, S_ID)).length, 2, "回滚后仍是两行");
  const [rows] = await getPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM persona WHERE user_id = ? AND slot = 2", [u]);
  assert.equal(Number(rows[0]?.n), 0);
});

test("assertControl：旧 epoch 延迟提交 0 行；锁序乱序在触库前拒、两事务各自升序不互卡；deactivate → delete", async () => {
  const u = uid("persona-b");
  const ids = await withKitTx(KIT, S_ID, async (tx) => [await tx.createPersona(u, 0), await tx.createPersona(u, 1)]);
  const [A, B] = [...ids].sort();
  await withKitTx(KIT, S_ID, async (tx) => { await tx.assertControl(A, 0); await tx.assertControl(B, 0); });
  // MF4 抬高 epoch（这里直接 UPDATE 模拟）后，手上还是 epoch 0 的写被存储边界拒
  await getPool().execute("UPDATE persona SET control_epoch = control_epoch + 1 WHERE server_id = ? AND persona_id = ?", [S_ID, A]);
  await assert.rejects(withKitTx(KIT, S_ID, (tx) => tx.assertControl(A, 0)),
    (e: unknown) => e instanceof ControlConflictError && e.actualEpoch === 1, "旧 epoch 延迟提交 0 行");
  await withKitTx(KIT, S_ID, (tx) => tx.assertControl(A, 1));
  // 乱序：同事务内 B 后 A ⇒ 触库前拒（⛔ 不等死锁）
  await assert.rejects(withKitTx(KIT, S_ID, async (tx) => { await tx.assertControl(B, 0); await tx.assertControl(A, 1); }), PersonaLockOrderError);
  // 两个并发事务各自升序：不互卡（各自持 A 再持 B）
  const results = await Promise.all([
    withKitTx(KIT, S_ID, async (tx) => { await tx.assertControl(A, 1); await tx.assertControl(B, 0); return "t1"; }),
    withKitTx(KIT, S_ID, async (tx) => { await tx.assertControl(A, 1); await tx.assertControl(B, 0); return "t2"; }),
  ]);
  assert.deepEqual(results, ["t1", "t2"]);
  // 生命周期
  await assert.rejects(withKitTx(KIT, S_ID, (tx) => tx.deletePersona(B)), PersonaBusyError, "active 不能直接删");
  await withKitTx(KIT, S_ID, (tx) => tx.deactivatePersona(B));
  await getPool().execute("UPDATE persona SET world_address = 'map/line/inst' WHERE server_id = ? AND persona_id = ?", [S_ID, B]);
  await assert.rejects(withKitTx(KIT, S_ID, (tx) => tx.deletePersona(B)), PersonaBusyError, "在世界房不能删");
  await getPool().execute("UPDATE persona SET world_address = NULL WHERE server_id = ? AND persona_id = ?", [S_ID, B]);
  await withKitTx(KIT, S_ID, (tx) => tx.deletePersona(B));
  assert.deepEqual((await listPersonas(KIT, u, S_ID)).map((p) => p.personaId), [A]);
});
