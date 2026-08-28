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
import { assertAdmissionOpen } from "./lifecycle";

export interface RedisRouteEntry { url: string; range: [number, number] }
export interface RedisRouteTable { durable: RedisRouteEntry[]; cacheUrl: string }

let table: RedisRouteTable | null = null;
let clients = new Map<string, Redis>();
let redisClosing = false;
let redisClosePromise: Promise<void> | null = null;

/**
 * Validate a route URL before any ioredis client is constructed.  Keeping this
 * pure/exported makes the fail-closed rule testable without opening sockets.
 */
export function validateRedisUrl(raw: unknown, label: string): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error(`redis-route: ${label}.url 缺失`);
  }
  // Configuration whitespace is almost always an interpolation/secret-file
  // mistake.  Reject it instead of silently changing the configured endpoint
  // and making route files differ from what operators inspected.
  if (raw !== raw.trim()) {
    throw new Error(`redis-route: ${label}.url 不得含前后空白：「${raw}」`);
  }
  const value = raw;
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

/** Parse and validate a route-file document without opening any Redis connection. */
export function parseRedisRouteDocument(doc: unknown): RedisRouteTable {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
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
  const entries: RedisRouteEntry[] = raw.durable.map((value, index) => {
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
  return { durable: sorted, cacheUrl: validateRedisUrl(cache.url, "cache") };
}

function loadTable(): RedisRouteTable {
  if (table) { return table; }
  if (redisClosing) {
    throw new Error("redis-route: Redis 正在关闭，拒绝创建新路由");
  }
  // Once process admission is closed, a late handler may still read through
  // an already-created route, but it must not create a fresh route generation
  // after the current one has been drained.
  assertAdmissionOpen();
  const file = REDIS_ROUTE_FILE();
  if (!file) {
    table = {
      durable: [{ url: validateRedisUrl(REDIS_DURABLE_URL(), "durable[0]"), range: [0, BUCKETS - 1] }],
      cacheUrl: validateRedisUrl(REDIS_CACHE_URL(), "cache"),
    };
    return table;
  }
  const doc = parseYaml(readFileSync(file, "utf8")) as unknown;
  table = parseRedisRouteDocument(doc);
  return table;
}

function clientOf(url: string): Redis {
  validateRedisUrl(url, "client");
  let c = clients.get(url);
  if (c) { return c; }
  if (redisClosing) {
    throw new Error("redis-route: Redis 正在关闭，拒绝创建新连接");
  }
  // Existing clients remain usable while rooms wind down.  Only creation of
  // a new client is gated, so a late operation cannot resurrect Redis after
  // the shutdown close has completed.
  assertAdmissionOpen();
  c = new Redis(url, { lazyConnect: false });
  clients.set(url, c);
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
 *  prod-split 指向物理隔离 HA。只承载 `stream:kick`（踢人广播 `{uid,reason[,exceptHash,issuedAt,sId]}`、⛔ 无 epoch 无 ack），⛔ 非路由键（直连单实例）。
 *  ⛔ **非账号服务自持**：WebPlatform 不持 coord、刻意不广播撤销（WEBPLATFORM.md §5），发布方是本组的 `kickBus.broadcastKick`。 */
export function coordClient(): Redis {
  return clientOf(REDIS_COORD_URL());
}

/** 测试/停服：断开全部连接并重置路由表（下次按新 env 重建）。 */
export function closeRedis(): Promise<void> {
  if (redisClosePromise) { return redisClosePromise; }

  // Detach this generation before awaiting network I/O. Any future restart
  // (after an explicit lifecycle reset) gets a different map/table identity,
  // so this close can never clear those resources on completion.
  const closingClients = clients;
  const closingTable = table;
  clients = new Map<string, Redis>();
  table = null;
  redisClosing = true;

  const run = (async () => {
    await Promise.all([...closingClients.values()].map(async (c) => {
      // Keep the fallback inside an async try/catch: adapters and test doubles
      // are allowed to throw synchronously from `quit()`, which must not abort
      // the close pass before the remaining clients are visited.
      try {
        await c.quit();
      } catch {
        c.disconnect();
      }
    }));
    closingClients.clear();
    // Keep the identity guard even though normal callers are gated above; it
    // protects embedded test harnesses that deliberately reopen during close.
    if (clients === closingClients) { clients.clear(); }
    if (table === closingTable) { table = null; }
  })();
  let closePromise!: Promise<void>;
  closePromise = run.finally(() => {
    if (redisClosePromise === closePromise) {
      redisClosePromise = null;
      redisClosing = false;
    }
  });
  redisClosePromise = closePromise;
  return closePromise;
}

/** Test seam for exercising the real REDIS_ROUTE_FILE loader without clients. */
export const _redisRouteTestHooks = {
  loadTable,
  resetTable: (): void => { table = null; },
};
