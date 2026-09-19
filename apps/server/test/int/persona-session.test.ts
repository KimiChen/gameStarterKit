/**
 * MF2-B5 会话撤销覆盖 persona（docs/MMO.md §5 MF2）真库 + 真 Redis 回归：
 *  - 顶号（`writeGroupSess` 写出新登录态且旧 hash 不同）⇒ 该 uid **本区**全部 persona 的 session_generation +1，别区不动；
 *  - 首登（无旧登录态）/ 重连或重试（unchanged）/ 陈旧写（stale）⛔ 不抬；
 *  - 抬代失败：照踢（本节点 + 广播）、踢完再抛（与 touchActive 失败同款）；
 *  - 账号级撤销 `revokePersonaSessions(uid)` 抬全部区；无 persona 的账号 0 行。
 * 前置：本地栈已启动且 db:bootstrap 已跑到 MF2-B5 形态（persona.idx_persona_uid）。⚠ int 文件只能单文件串行跑。
 */
import "./env-setup"; // 必须第一个 import
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { writeGroupSess } from "../../src/core/auth/session";
import { revokePersonaSessions } from "../../src/core/auth/kickBus";
import { withKitTx } from "../../src/core/infra/kitApi";
import { activeLruBucketOf, kActiveLru, kSess } from "../../src/core/infra/keys";
import { clientFor, closeRedis, indexClientFor } from "../../src/core/infra/redisRoute";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import type { RowDataPacket } from "../../src/core/infra/mysql";
import { cleanupUser, testUid } from "./helpers";

const KIT = "arena";
const uids: string[] = [];
const uid = (n: string): string => { const u = testUid(n).slice(0, 32); uids.push(u); return u; };

after(async () => {
  for (const u of uids) {
    await getPool().execute("DELETE FROM persona WHERE user_id = ?", [u]);
    await cleanupUser(u);
    await clientFor(u).unlink(kSess(u, 0), kSess(u, 1));
    const b = activeLruBucketOf(u);
    await indexClientFor(b).zrem(kActiveLru(b), u);
  }
  await closeRedis();
  await closeMysql();
});

/** `s<区>/<槽>` → session_generation */
async function generations(u: string): Promise<Record<string, number>> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT server_id, slot, session_generation FROM persona WHERE user_id = ? ORDER BY server_id, slot", [u]);
  return Object.fromEntries(rows.map((r) => [`s${r.server_id}/${r.slot}`, Number(r.session_generation)]));
}

test("顶号抬高本区全部 persona 会话代（别区不动）；首登 / 重连 / 陈旧写不抬；抬代失败照踢再抛；账号级撤销抬全部区", async () => {
  const u = uid("psess");
  await withKitTx(KIT, 0, async (tx) => { await tx.createPersona(u, 0); await tx.createPersona(u, 1); });
  await withKitTx(KIT, 1, async (tx) => { await tx.createPersona(u, 0); });
  const kicks: string[] = [];
  const deps = {
    kickLocal: (): void => { kicks.push("local"); },
    broadcastKick: async (): Promise<void> => { kicks.push("broadcast"); },
  };
  assert.equal(await writeGroupSess(u, "t1", 0, "", 1001, deps), "written");
  assert.deepEqual(await generations(u), { "s0/0": 0, "s0/1": 0, "s1/0": 0 }, "首登（无旧登录态）⛔ 不抬");
  assert.deepEqual(kicks, []);

  assert.equal(await writeGroupSess(u, "t2", 0, "", 1002, deps), "written");
  assert.deepEqual(await generations(u), { "s0/0": 1, "s0/1": 1, "s1/0": 0 }, "顶号：区 0 全部 persona +1，区 1 不动");
  assert.deepEqual(kicks, ["local", "broadcast"], "顶号照常踢");

  assert.equal(await writeGroupSess(u, "t2", 0, "", 1002, deps), "unchanged");
  assert.equal(await writeGroupSess(u, "t1", 0, "", 1001, deps), "stale");
  assert.deepEqual(await generations(u), { "s0/0": 1, "s0/1": 1, "s1/0": 0 }, "重连 / 重试 / 陈旧写 ⛔ 不抬");
  assert.deepEqual(kicks, ["local", "broadcast"]);

  // 抬代失败：照踢（本节点 + 广播）、踢完再抛
  await assert.rejects(writeGroupSess(u, "t3", 0, "", 1003, {
    ...deps,
    revokePersonaSessions: async (): Promise<number> => { throw new Error("injected mysql failure"); },
  }), /injected mysql failure/u);
  assert.deepEqual(kicks, ["local", "broadcast", "local", "broadcast"], "抬代失败 ⛔ 不漏踢");
  assert.deepEqual(await generations(u), { "s0/0": 1, "s0/1": 1, "s1/0": 0 });

  // 账号级撤销（封号 / 撤销 / GM /admin/kick）：全部区
  assert.equal(await revokePersonaSessions(u), 3);
  assert.deepEqual(await generations(u), { "s0/0": 2, "s0/1": 2, "s1/0": 1 });
  assert.equal(await revokePersonaSessions(uid("psess-none")), 0, "无 persona 的账号 0 行（非 MMO 宿主常态）");
});
