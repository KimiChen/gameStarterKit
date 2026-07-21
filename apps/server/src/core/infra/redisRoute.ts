/**
 * Redis 桶路由：16384 桶 → 实例（[06/07]）。
 *
 * - durable（noeviction + AOF everysec）与 cache（allkeys-lru）**物理分实例**（09·R4）。
 * - 路由键 = key 的 hash-tag（`{...}` 内容）crc32 % 16384。BUCKETS 永不改（09·S2）。
 * - 无 REDIS_ROUTE_FILE 时退化为单 durable + 单 cache（env URL），路由函数签名不变，
 *   业务代码不感知分片形态。
 *
 * 两套寻址（08）：
 * - `clientFor(uid)`         —— per-user key（hash-tag 是 uid）
 * - `indexClientFor(bucket)` —— `active:lru:{bucket}`（hash-tag 是 bucket 数字）
 */
import { readFileSync } from "node:fs";
import { crc32 } from "node:zlib";
import Redis from "ioredis";
import { parse as parseYaml } from "yaml";
import { BUCKETS, REDIS_CACHE_URL, REDIS_DURABLE_URL, REDIS_ROUTE_FILE } from "./config";

interface RouteEntry { url: string; range: [number, number] }
interface RouteTable { durable: RouteEntry[]; cacheUrl: string }

let table: RouteTable | null = null;
const clients = new Map<string, Redis>();

function loadTable(): RouteTable {
  if (table) { return table; }
  const file = REDIS_ROUTE_FILE();
  if (!file) {
    table = { durable: [{ url: REDIS_DURABLE_URL(), range: [0, BUCKETS - 1] }], cacheUrl: REDIS_CACHE_URL() };
    return table;
  }
  const doc = parseYaml(readFileSync(file, "utf8")) as {
    buckets: number;
    durable: { url: string; range: [number, number] }[];
    cache: { url: string };
  };
  if (doc.buckets !== BUCKETS) {
    throw new Error(`redis-route: buckets=${doc.buckets} ≠ ${BUCKETS}（BUCKETS 永不改，09·S2）`);
  }
  // 范围必须无缝覆盖 [0, BUCKETS)，装载时校验，别等运行期路由黑洞
  const sorted = [...doc.durable].sort((a, b) => a.range[0] - b.range[0]);
  let next = 0;
  for (const e of sorted) {
    if (e.range[0] !== next) { throw new Error(`redis-route: 桶 ${next} 未覆盖`); }
    next = e.range[1] + 1;
  }
  if (next !== BUCKETS) { throw new Error(`redis-route: 桶 ${next}..${BUCKETS - 1} 未覆盖`); }
  table = { durable: sorted, cacheUrl: doc.cache.url };
  return table;
}

function clientOf(url: string): Redis {
  let c = clients.get(url);
  if (!c) {
    c = new Redis(url, { lazyConnect: false });
    clients.set(url, c);
  }
  return c;
}

/** hash-tag（`{...}` 内容；无则整个 key）→ 桶号。 */
export function bucketOf(tag: string): number {
  return (crc32(Buffer.from(tag)) >>> 0) % BUCKETS;
}

function durableForBucket(bucket: number): Redis {
  const t = loadTable();
  for (const e of t.durable) {
    if (bucket >= e.range[0] && bucket <= e.range[1]) { return clientOf(e.url); }
  }
  throw new Error(`redis-route: 桶 ${bucket} 无路由`); // loadTable 已校验，理论不可达
}

/** per-user key 寻址：user:{uid} / bag / fence / applied / lock / sess … 全部同实例。 */
export function clientFor(uid: string): Redis {
  return durableForBucket(bucketOf(uid));
}

/** `active:lru:{bucket}` 寻址：hash-tag 是 bucket 数字本身，与任何 uid 不同槽。 */
export function indexClientFor(bucket: number): Redis {
  return durableForBucket(bucketOf(String(bucket)));
}

/** 跨用户 key（stream:match / 匿名 rl:*）：按整 key 或其 hash-tag 路由。 */
export function clientForKey(key: string): Redis {
  const m = /\{(.+?)\}/.exec(key);
  return durableForBucket(bucketOf(m ? m[1] : key));
}

/** cache 实例（allkeys-lru，物理独立）。只放可再生数据。 */
export function cacheClient(): Redis {
  return clientOf(loadTable().cacheUrl);
}

/** 测试/停服：断开全部连接并重置路由表（下次按新 env 重建）。 */
export async function closeRedis(): Promise<void> {
  await Promise.all([...clients.values()].map((c) => c.quit().catch(() => c.disconnect())));
  clients.clear();
  table = null;
}
