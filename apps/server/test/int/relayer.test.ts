/**
 * M6 DoD（真实进程 kill 部分）：
 *  1. 阶段 1 提交后 kill -9 → relayer 补发，道具到账
 *  2. 阶段 2 后 kill（未标 done）→ relayer 重放判 dup 不重复发
 *  3. 僵尸 relayer（SIGSTOP 超租约再 SIGCONT）→ 守卫 UPDATE 0 行自杀，未写业务表
 * relayer / worker 都是独立子进程（env：LEASE_TTL_S=3 短租约、RELAYER_VISIBILITY_S=0 立即可见）。
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { after, before, test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CUR_GOLD, OUTBOX_DONE, OUTBOX_PENDING } from "../../src/core/infra/config";
import { kBag } from "../../src/core/infra/keys";
import { clientFor, closeRedis } from "../../src/core/infra/redisRoute";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import type { RowDataPacket } from "../../src/core/infra/mysql";
import { createUser } from "../../src/core/userRecord";
import { deriveOpId } from "../../src/core/economy/outbox";
import { assertRedisUp, cleanupUser, sleep, testUid } from "./helpers";

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, "..", "..");
const WORKER_ENV = { ...process.env, LEASE_TTL_S: "3", RELAYER_VISIBILITY_S: "0" };

const uids: string[] = [];
const children: ChildProcess[] = [];

async function seedUser(name: string, balance: number): Promise<string> {
  const u = testUid(name).slice(0, 32);
  uids.push(u);
  await getPool().execute(
    "INSERT INTO user_currency (user_id, currency, balance) VALUES (?,?,?)", [u, CUR_GOLD, balance]);
  await createUser(u);
  return u;
}

/** 起子进程并等 stdout 出现标记。 */
function spawnUntil(script: string, args: string[], marker: string, timeoutMs = 20_000): Promise<ChildProcess> {
  const child = spawn("node", ["--import", "tsx", script, ...args], {
    env: WORKER_ENV, cwd: serverRoot, stdio: ["ignore", "pipe", "inherit"],
  });
  children.push(child);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`等 "${marker}" 超时: ${script}`)), timeoutMs);
    child.stdout!.on("data", (d: Buffer) => {
      if (d.toString().includes(marker)) { clearTimeout(timer); resolve(child); }
    });
    child.on("exit", (code, sig) => {
      // SIGKILL 自杀是 purchaseKill worker 的预期结束方式
      if (sig !== "SIGKILL") { clearTimeout(timer); reject(new Error(`子进程提前退出 code=${code} sig=${sig}`)); }
    });
  });
}

const outboxStatus = async (opId: string): Promise<number | null> => {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT status FROM gameplay_outbox WHERE op_id = ?", [opId]);
  return rows.length > 0 ? Number(rows[0].status) : null;
};

async function waitOutboxDone(opId: string, timeoutMs = 15_000): Promise<void> {
  const t0 = Date.now();
  while (await outboxStatus(opId) !== OUTBOX_DONE) {
    assert.ok(Date.now() - t0 < timeoutMs, `等 outbox done 超时 op=${opId}`);
    await sleep(200);
  }
}

/** 让 singleton_lease 立即可抢（上一批测试可能留下未过期租约）。 */
async function expireLease(): Promise<void> {
  await getPool().execute(
    "UPDATE singleton_lease SET expires_at = NOW(3) - INTERVAL 1 SECOND WHERE lease_name = 'outbox_relayer'");
}

before(async () => { await assertRedisUp(); });
after(async () => {
  for (const c of children) { try { c.kill("SIGKILL"); } catch { /* 已死 */ } }
  const pool = getPool();
  for (const u of uids) {
    await pool.execute("DELETE FROM currency_ledger WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM gameplay_outbox WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM user_currency WHERE user_id = ?", [u]);
    await cleanupUser(u);
  }
  await expireLease(); // 归还租约给后续测试/真实进程
  await closeRedis();
  await closeMysql();
});

test("阶段 1 提交后 kill -9 → relayer 补发道具；阶段 2 后 kill → 重放判 dup 不重复发", async () => {
  const killWorker = join(here, "workers", "purchaseKill.ts");
  const relayerScript = join(serverRoot, "src", "core", "economy", "relayer.ts");
  await expireLease();

  // 场景 A：阶段 1 后猝死（钱扣了、intent durable、道具没发）
  const ua = await seedUser("k1", 1000);
  const opA = deriveOpId(ua, "shop.purchase", "req-k1");
  await spawnUntil(killWorker, [ua, "shop.frag29x10", "req-k1", "p1"], "PHASE1_DONE");
  await sleep(100); // 等 SIGKILL 生效
  assert.equal(await outboxStatus(opA), OUTBOX_PENDING, "intent durable 且 pending");
  assert.equal(await clientFor(ua).exists(kBag(ua, 29 % 4)), 0, "道具尚未发");

  // 场景 B：阶段 2 后猝死（道具已发、outbox 仍 pending）
  const ub = await seedUser("k2", 1000);
  const opB = deriveOpId(ub, "shop.purchase", "req-k2");
  await spawnUntil(killWorker, [ub, "shop.frag29x10", "req-k2", "p2"], "PHASE2_DONE");
  await sleep(100);
  assert.equal(await outboxStatus(opB), OUTBOX_PENDING);
  assert.equal(await clientFor(ub).hget(kBag(ub, 29 % 4), "29"), "10", "道具已发");

  // 起 relayer 收敛两个场景
  const relayer = await spawnUntil(relayerScript, [], "lease acquired");
  await waitOutboxDone(opA);
  await waitOutboxDone(opB);
  assert.equal(await clientFor(ua).hget(kBag(ua, 29 % 4), "29"), "10", "A：relayer 补发到账");
  assert.equal(await clientFor(ub).hget(kBag(ub, 29 % 4), "29"), "10", "B：重放 dup，仍是 10 不翻倍");
  relayer.kill("SIGKILL");
});

test("僵尸 relayer：SIGSTOP 超租约再 SIGCONT → 守卫 0 行自杀，未写业务表", async () => {
  const relayerScript = join(serverRoot, "src", "core", "economy", "relayer.ts");
  await expireLease();

  const zombie = await spawnUntil(relayerScript, [], "lease acquired");
  zombie.kill("SIGSTOP");            // 冻住，租约 3s 后过期
  await sleep(4000);

  const successor = await spawnUntil(relayerScript, [], "lease acquired"); // 顶替者上位

  // 顶替者在位期间投一行 outbox：只有它能处理
  const u = await seedUser("zb", 1000);
  const opId = deriveOpId(u, "shop.purchase", "req-zb");
  await getPool().execute(
    "INSERT INTO gameplay_outbox (op_id, user_id, effect, status) VALUES (?,?,CAST(? AS JSON),?)",
    [opId, u, JSON.stringify([{ kind: "item", itemId: 29, count: 10 }]), OUTBOX_PENDING]);
  await waitOutboxDone(opId);

  // 解冻僵尸：下一个 tick 续租守卫 0 行 → 自杀（exit 1），⛔ 不碰业务表
  const exited = new Promise<number | null>((r) => zombie.once("exit", (code) => r(code)));
  zombie.kill("SIGCONT");
  assert.equal(await exited, 1, "僵尸以自杀路径退出");

  assert.equal(await clientFor(u).hget(kBag(u, 29 % 4), "29"), "10", "道具恰好一次（僵尸未双写）");
  assert.equal(await outboxStatus(opId), OUTBOX_DONE);
  successor.kill("SIGKILL");
});
