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
import { BUCKETS, REDIS_CACHE_URL, REDIS_COORD_URL, REDIS_DURABLE_URL, REDIS_ROUTE_FILE } from "./config";

interface RouteEntry { url: string; range: [number, number] }
interface RouteTable { durable: RouteEntry[]; cacheUrl: string }

let table: RouteTable | null = null;
const clients = new Map<string, Redis>();

/**
 * Validate a route URL before any ioredis client is constructed.  Keeping this
 * pure/exported makes the fail-closed rule testable without opening sockets.
 */
export function validateRedisUrl(raw: unknown, label: string): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error(`redis-route: ${label}.url 缺失`);
  }
  const value = raw.trim();
  let parsed: URL;
  try { parsed = new URL(value); } catch {
    throw new Error(`redis-route: ${label}.url 非法：「${raw}」`);
  }
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error(`redis-route: ${label}.url 必须使用 redis:// 或 rediss://：「${raw}」`);
  }
  if (!parsed.hostname) {
    throw new Error(`redis-route: ${label}.url 缺少 host：「${raw}」`);
  }
  return value;
}

function loadTable(): RouteTable {
  if (table) { return table; }
  const file = REDIS_ROUTE_FILE();
  if (!file) {
    table = {
      durable: [{ url: validateRedisUrl(REDIS_DURABLE_URL(), "durable[0]"), range: [0, BUCKETS - 1] }],
      cacheUrl: validateRedisUrl(REDIS_CACHE_URL(), "cache"),
    };
    return table;
  }
  const doc = parseYaml(readFileSync(file, "utf8")) as unknown;
  if (!doc || typeof doc !== "object") {
    throw new Error("redis-route: 配置必须是 YAML object");
  }
  const raw = doc as { buckets?: unknown; durable?: unknown; cache?: unknown };
  if (raw.buckets !== BUCKETS) {
    throw new Error(`redis-route: buckets=${String(raw.buckets)} ≠ ${BUCKETS}（BUCKETS 永不改，09·S2）`);
  }
  if (!Array.isArray(raw.durable) || raw.durable.length === 0) {
    throw new Error("redis-route: durable 必须是非空数组");
  }
  if (!raw.cache || typeof raw.cache !== "object") {
    throw new Error("redis-route: cache 配置缺失");
  }
  const cache = raw.cache as { url?: unknown };
  const entries: RouteEntry[] = raw.durable.map((value, index) => {
    if (!value || typeof value !== "object") {
      throw new Error(`redis-route: durable[${index}] 必须是 object`);
    }
    const entry = value as { url?: unknown; range?: unknown };
    if (!Array.isArray(entry.range) || entry.range.length !== 2
      || !Number.isSafeInteger(entry.range[0]) || !Number.isSafeInteger(entry.range[1])
      || entry.range[0] < 0 || entry.range[1] >= BUCKETS || entry.range[0] > entry.range[1]) {
      throw new Error(`redis-route: durable[${index}].range 非法：${JSON.stringify(entry.range)}`);
    }
    return {
      url: validateRedisUrl(entry.url, `durable[${index}]`),
      range: [entry.range[0], entry.range[1]],
    };
  });
  // 范围必须无缝覆盖 [0, BUCKETS)，装载时校验，别等运行期路由黑洞
  const sorted = [...entries].sort((a, b) => a.range[0] - b.range[0]);
  let next = 0;
  for (const e of sorted) {
    if (e.range[0] !== next) { throw new Error(`redis-route: 桶 ${next} 未覆盖`); }
    next = e.range[1] + 1;
  }
  if (next !== BUCKETS) { throw new Error(`redis-route: 桶 ${next}..${BUCKETS - 1} 未覆盖`); }
  table = { durable: sorted, cacheUrl: validateRedisUrl(cache.url, "cache") };
  return table;
}

function clientOf(url: string): Redis {
  validateRedisUrl(url, "client");
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

/** coord / 踢人控制总线 Redis（**组侧**设施，DUAL_MODE §2.3 / §4.2）：dev 缺省复用 durable 实例（同 URL → clientOf 复用同连接），
 *  prod-split 指向物理隔离 HA。只承载 `stream:kick`（踢人广播，事件仅 {uid,reason[,exceptHash]}、⛔ 无 epoch 无 ack），⛔ 非路由键（直连单实例）。
 *  ⛔ **非账号服务自持**：WebPlatform 不持 coord、刻意不广播撤销（WEBPLATFORM.md §5），发布方是本组的 `kickBus.broadcastKick`。 */
export function coordClient(): Redis {
  return clientOf(REDIS_COORD_URL());
}

/** 测试/停服：断开全部连接并重置路由表（下次按新 env 重建）。 */
export async function closeRedis(): Promise<void> {
  await Promise.all([...clients.values()].map((c) => c.quit().catch(() => c.disconnect())));
  clients.clear();
  table = null;
}
