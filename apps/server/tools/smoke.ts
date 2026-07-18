/**
 * M1 DoD 连通性冒烟（10·M1）：
 *  1. 连 durable + cache 两个 Redis，校验 maxmemory-policy 形态（09·R4）
 *  2. 连 MySQL，SHOW TABLES 与 schema.sql 清单齐全 + seq / singleton_lease 预置行在
 *  3. EVALSHA 走通 NOSCRIPT 重载路径（先 SCRIPT FLUSH 再调用，必须自动 SCRIPT LOAD 成功）
 * 用法: npm --workspace @game/server run smoke:framework
 */
import { cacheClient, clientFor, closeRedis } from "../src/core/infra/redisRoute";
import { CAS_DEL, TOKEN_BUCKET, evalshaWithReload } from "../src/core/infra/redisScripts";
import { closeMysql, getPool } from "../src/core/infra/mysql";
import type { RowDataPacket } from "../src/core/infra/mysql";
import { kLock, kRl } from "../src/core/infra/keys";

const EXPECTED_TABLES = [
  "accounts", "user_currency", "currency_ledger", "gameplay_outbox", "singleton_lease",
  "purchases", "match_index", "match_results", "mail", "login_audit", "seq",
  "user_archive", "user_snapshot_readonly",
];
const EXPECTED_LEASES = ["outbox_relayer", "freeze_worker", "season_rotation"];

let failed = false;
const check = (name: string, ok: boolean, detail = ""): void => {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) { failed = true; }
};

async function main(): Promise<void> {
  // ① 两个 Redis 实例形态
  const durable = clientFor("smoke");
  const cache = cacheClient();
  check("redis durable PING", (await durable.ping()) === "PONG");
  check("redis cache PING", (await cache.ping()) === "PONG");
  const dPolicy = (await durable.config("GET", "maxmemory-policy")) as string[];
  const cPolicy = (await cache.config("GET", "maxmemory-policy")) as string[];
  check("durable = noeviction", dPolicy[1] === "noeviction", dPolicy[1]);
  check("cache = allkeys-lru", cPolicy[1] === "allkeys-lru", cPolicy[1]);
  const aof = (await durable.config("GET", "appendonly")) as string[];
  check("durable AOF 开启", aof[1] === "yes", `appendonly=${aof[1]}`);

  // ② MySQL 表齐全 + 预置行
  const pool = getPool();
  const [tables] = await pool.query<RowDataPacket[]>("SHOW TABLES");
  const names = new Set(tables.map((r) => String(Object.values(r)[0])));
  for (const t of EXPECTED_TABLES) { check(`表 ${t}`, names.has(t)); }
  const [seqRows] = await pool.query<RowDataPacket[]>("SELECT val FROM seq WHERE name = 'user_id'");
  check("seq('user_id') 预置行", seqRows.length === 1);
  const [leases] = await pool.query<RowDataPacket[]>("SELECT lease_name FROM singleton_lease");
  const leaseNames = new Set(leases.map((r) => r.lease_name as string));
  for (const l of EXPECTED_LEASES) { check(`singleton_lease('${l}')`, leaseNames.has(l)); }

  // ③ NOSCRIPT 重载路径：清掉脚本缓存后首次 EVALSHA 必然 NOSCRIPT → 自动 LOAD → 重试成功
  await durable.script("FLUSH");
  const lockKey = kLock("smoke_noscript");
  await durable.set(lockKey, "42", "PX", 5000);
  const del = await evalshaWithReload(durable, CAS_DEL, [lockKey], ["42"]);
  check("EVALSHA NOSCRIPT 自动重载（casDel）", del === 1, `返回 ${String(del)}`);
  const remain = await evalshaWithReload(durable, TOKEN_BUCKET, [kRl("smoke")], [10, 1, 1]);
  check("tokenBucket（TIME 在 Lua 内）", typeof remain === "number" && remain >= 0, `剩余 ${String(remain)}`);
  await durable.del(kRl("smoke"));

  await closeRedis();
  await closeMysql();
  if (failed) { process.exit(1); }
  console.log("—— M1 冒烟全部通过 ——");
}

main().catch((e) => { console.error("❌ 冒烟失败", e); process.exit(1); });
