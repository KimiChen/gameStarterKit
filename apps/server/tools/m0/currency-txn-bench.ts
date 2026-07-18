/**
 * M0 硬闸 ②：货币同步事务压测（10·M0）。
 *
 * 目标事务 = [04 · 阶段 1](docs/SERVER.md) 的原样三条：
 *   BEGIN(READ COMMITTED, 09·DB5)
 *     INSERT currency_ledger … ON DUPLICATE KEY UPDATE id = id   （幂等去重，⛔ 禁 INSERT IGNORE，09·DB1）
 *     UPDATE user_currency SET balance = balance - ? …
 *       WHERE … AND balance >= ? AND last_fence <= ?             （余额守卫 + fence 守业务写，affectedRows 判成败，09·DB2）
 *     INSERT gameplay_outbox (op_id, user_id, effect, status=0)  （status 数字常量，09·X4/DB6）
 *   COMMIT
 *
 * 产出一个数字：p99 延迟。必须 < LOCK_TTL_MS(5000ms)，理想 < 100ms（锁 TTL 必须罩住事务 p99，09·L6）。
 *
 * 压测数据全部用 `bench_` 前缀 user_id，跑完 DELETE 清理，不污染业务行。
 *
 * 用法: npm --workspace @game/server exec tsx -- tools/m0/currency-txn-bench.ts \
 *         [--workers 8] [--txns 2000] [--users 1000]
 *   workers = 进程内并发事务数（异步循环，I/O bound，无需 worker_threads）
 *   txns    = 每 worker 事务数；users = 预置 bench 用户数
 */
import { parseArgs } from "node:util";
import { CUR_GOLD, LOCK_TTL_MS, OUTBOX_PENDING } from "../../src/core/infra/config";
import { closeMysql, getPool, retryOnContention, withRcTx } from "../../src/core/infra/mysql";
import type { ResultSetHeader } from "../../src/core/infra/mysql";

const { values: args } = parseArgs({
  options: {
    workers: { type: "string", default: "8" },
    txns: { type: "string", default: "2000" },
    users: { type: "string", default: "1000" },
  },
});
const WORKERS = Number(args.workers);
const TXNS = Number(args.txns);
const USERS = Number(args.users);

const PRICE = 1;                        // 每笔扣 1，seed 余额足够覆盖全部事务
const SEED_BALANCE = 1_000_000_000;
const RUN_ID = Date.now().toString(36); // op_id 跑次隔离（清理失败重跑也不撞唯一键）

const uidOf = (i: number): string => `bench_${String(i).padStart(6, "0")}`;

/** bench_ 前缀行分批清理（LIMIT 循环，避免一条大 DELETE 长持锁）。 */
async function cleanupBenchRows(): Promise<void> {
  const pool = getPool();
  for (const table of ["currency_ledger", "gameplay_outbox", "user_currency"]) {
    for (;;) {
      const [r] = await pool.query<ResultSetHeader>(
        `DELETE FROM ${table} WHERE user_id LIKE 'bench\\_%' LIMIT 5000`);
      if (r.affectedRows < 5000) { break; }
    }
  }
}

/** 预置 bench 用户余额（先清后插，分批 multi-VALUES）。 */
async function seedUsers(): Promise<void> {
  const pool = getPool();
  const CHUNK = 500;
  for (let i = 0; i < USERS; i += CHUNK) {
    const n = Math.min(CHUNK, USERS - i);
    const values = Array.from({ length: n }, () => "(?,?,?,0,0)").join(",");
    const params: (string | number)[] = [];
    for (let j = 0; j < n; j++) { params.push(uidOf(i + j), CUR_GOLD, SEED_BALANCE); }
    await pool.query(
      `INSERT INTO user_currency (user_id, currency, balance, version, last_fence) VALUES ${values}`,
      params);
  }
}

/** 目标事务（[04] 阶段 1 原样）。返回值仅供 dup 统计。 */
async function purchaseTxn(uid: string, opId: string): Promise<"ok" | "dup"> {
  return withRcTx(async (conn) => {
    // 幂等去重：ODKU no-op；affectedRows 插入=1 / 重复=0（09·DB1/DB2）。
    // balance_after 此处按 04 示例填 0 占位（真实实现同事务回读，M6 落地）。
    const [led] = await conn.execute<ResultSetHeader>(
      `INSERT INTO currency_ledger (user_id, idem_key, currency, delta, balance_after, reason)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE id = id`,
      [uid, opId, CUR_GOLD, -PRICE, 0, "m0.bench"]);
    if (led.affectedRows === 0) { return "dup"; }

    // 原子扣减 + 余额守卫 + fence 守业务写（bench fence 恒 0，与 seed 的 last_fence=0 匹配）
    const [upd] = await conn.execute<ResultSetHeader>(
      `UPDATE user_currency
          SET balance = balance - ?, version = version + 1, last_fence = ?
        WHERE user_id = ? AND currency = ? AND balance >= ? AND last_fence <= ?`,
      [PRICE, 0, uid, CUR_GOLD, PRICE, 0]);
    if (upd.affectedRows === 0) { throw new Error(`余额/fence 守卫拒绝: ${uid}（seed 不足？）`); }

    // durable intent —— 与扣钱同事务；status 数字常量（09·X4）
    await conn.execute(
      `INSERT INTO gameplay_outbox (op_id, user_id, effect, status)
       VALUES (?,?,CAST(? AS JSON),?)`,
      [opId, uid, JSON.stringify({ kind: "bench", grants: { item: 1 } }), OUTBOX_PENDING]);

    return "ok";
  });
}

function percentile(sortedMs: number[], p: number): number {
  const idx = Math.min(sortedMs.length - 1, Math.ceil((p / 100) * sortedMs.length) - 1);
  return sortedMs[Math.max(0, idx)];
}

async function main(): Promise<void> {
  const total = WORKERS * TXNS;
  console.log(`—— 货币事务压测：workers=${WORKERS} txns/worker=${TXNS} users=${USERS} 总事务=${total} ——`);
  console.log(`    MySQL: ${process.env.MYSQL_URL ?? "mysql://root@127.0.0.1:3316/game（默认）"}`);

  console.log("① 清理旧 bench 行 + 预置用户余额…");
  await cleanupBenchRows();
  await seedUsers();

  // 预热：让连接池建满连接，预热轮不计入统计
  console.log("② 预热连接池…");
  await Promise.all(Array.from({ length: WORKERS * 4 }, (_, i) =>
    purchaseTxn(uidOf(i % USERS), `bench_${RUN_ID}_warm_${i}`)));

  console.log("③ 压测中…");
  const latenciesMs: number[] = new Array<number>(total);
  let dups = 0;
  let retriedTxns = 0;
  const wallStart = process.hrtime.bigint();

  await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
    for (let i = 0; i < TXNS; i++) {
      // 用户轮转打散：相邻 worker 不打同一行，贴近真实多用户分布
      const uid = uidOf((w * TXNS + i * 31 + w) % USERS);
      const opId = `bench_${RUN_ID}_${w}_${i}`;
      let attempts = 0;
      const t0 = process.hrtime.bigint();
      // 1213/1205 有界退避重试（09·DB5）；重试时间计入延迟——这才是调用方看到的真实延迟
      const r = await retryOnContention(() => { attempts++; return purchaseTxn(uid, opId); });
      latenciesMs[w * TXNS + i] = Number(process.hrtime.bigint() - t0) / 1e6;
      if (r === "dup") { dups++; }
      if (attempts > 1) { retriedTxns++; }
    }
  }));

  const wallSec = Number(process.hrtime.bigint() - wallStart) / 1e9;
  latenciesMs.sort((a, b) => a - b);
  const p50 = percentile(latenciesMs, 50);
  const p90 = percentile(latenciesMs, 90);
  const p99 = percentile(latenciesMs, 99);
  const max = latenciesMs[latenciesMs.length - 1];
  const qps = total / wallSec;

  console.log("④ 结果：");
  console.log(`    总事务      ${total}（dup=${dups}，触发 1213/1205 重试的事务=${retriedTxns}）`);
  console.log(`    总耗时      ${wallSec.toFixed(2)}s`);
  console.log(`    吞吐 QPS    ${qps.toFixed(0)}`);
  console.log(`    p50 / p90   ${p50.toFixed(2)}ms / ${p90.toFixed(2)}ms`);
  console.log(`    p99 / max   ${p99.toFixed(2)}ms / ${max.toFixed(2)}ms`);

  // 断言式结论（09·L6：LOCK_TTL_MS 必须 > 货币事务 p99）
  const hardPass = p99 < LOCK_TTL_MS;
  const idealPass = p99 < 100;
  console.log(`${hardPass ? "✅" : "❌"} 硬闸：p99 ${p99.toFixed(2)}ms ${hardPass ? "<" : "≥"} LOCK_TTL_MS ${LOCK_TTL_MS}ms`);
  console.log(`${idealPass ? "✅" : "⚠️ "} 理想线：p99 ${p99.toFixed(2)}ms ${idealPass ? "<" : "≥"} 100ms${idealPass ? "" : "（未达理想线，生产规格机器复测）"}`);

  console.log("⑤ 清理 bench 行…");
  await cleanupBenchRows();
  await closeMysql();

  if (!hardPass) { process.exit(1); }
  console.log("—— 压测完成 ——");
}

main().catch(async (e) => {
  console.error("❌ 压测失败", e);
  // 失败也尽力清掉 bench 行，避免残留
  try { await cleanupBenchRows(); await closeMysql(); } catch { /* 清理失败忽略 */ }
  process.exit(1);
});
