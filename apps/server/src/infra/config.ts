/**
 * 全部服务端常量与环境变量（[07 · 接口契约与配置](../../../../docs/server/07-contracts-and-config.md)）。
 *
 * ⛔ 常量禁止散落在业务代码里（09 审查流程第 6 条）：新增常量/key/错误码必须先进 07 再进本文件。
 */

// ───────────────────────── 环境变量 ─────────────────────────

const env = (name: string, dflt?: string): string => {
  const v = process.env[name];
  if (v !== undefined && v !== "") { return v; }
  if (dflt !== undefined) { return dflt; }
  throw new Error(`缺少环境变量 ${name}`);
};
const envInt = (name: string, dflt: number): number => {
  const v = process.env[name];
  return v ? Number.parseInt(v, 10) : dflt;
};
// 速率类常量必须用它：parseInt 会把 '0.5' 截成 0，令牌桶 rate=0 语义完全变掉
const envFloat = (name: string, dflt: number): number => {
  const v = process.env[name];
  return v ? Number.parseFloat(v) : dflt;
};

/** 微信凭证走 KMS/Secret Manager 注入环境，不进代码库。惰性读取：仅 auth 路径需要。 */
export const wxConfig = () => ({
  appid: env("WX_APPID"),
  secret: env("WX_SECRET"),
  code2sessionUrl: env("WX_CODE2SESSION_URL", "https://api.weixin.qq.com/sns/jscode2session"),
});

export const MYSQL_URL = () => env("MYSQL_URL", "mysql://root@127.0.0.1:3316/game");
export const MYSQL_POOL_SIZE = envInt("MYSQL_POOL_SIZE", 20);

/** durable（noeviction + AOF everysec）与 cache（allkeys-lru）是两个物理实例（09·R4）。 */
export const REDIS_DURABLE_URL = () => env("REDIS_DURABLE_URL", "redis://127.0.0.1:6401");
export const REDIS_CACHE_URL = () => env("REDIS_CACHE_URL", "redis://127.0.0.1:6402");
export const REDIS_ROUTE_FILE = () => process.env.REDIS_ROUTE_FILE ?? "";

// ───────────────────────── 常量（07 全表） ─────────────────────────

/** 锁 TTL。必须 > 货币事务 p99（M0 压测定数，见 docs/server/m0-*）。 */
export const LOCK_TTL_MS = 5000;
/** 跨实例抢锁有界重试次数（09·L5：禁止无限递归）。 */
export const LOCK_RETRY_MAX = 3;
/** 幂等 pending 哨兵短租约（09·I1：⛔ 禁止 24h 长 TTL 毒丸）。 */
export const IDEM_PENDING_MS = 10_000;
/** 幂等结果缓存。 */
export const IDEM_RESULT_MS = 60_000;
/** sess:{uid} TTL = 3d。 */
export const SESS_TTL_S = 259_200;
export const OUTBOX_RETENTION_MS = 86_400_000;
/** ⚠ 必须 ≥ 2 × OUTBOX_RETENTION_MS（09·I5），否则 relayer 重放老 intent 二次发货。 */
export const APPLIED_RETENTION_MS = 172_800_000;
export const OUTBOX_MAX_ATTEMPTS = 10;
export const RELAYER_POLL_MS = 1000;
/** relayer 只取 created_at < NOW(3) - INTERVAL 5 SECOND 的行（给同步路径留完成窗口）。
 *  env 可调（kill 测试置 0 立即可见）。 */
export const RELAYER_VISIBILITY_S = envInt("RELAYER_VISIBILITY_S", 5);
/** singleton_lease TTL。env 可调（僵尸 worker kill 测试用短租约）。 */
export const LEASE_TTL_S = envInt("LEASE_TTL_S", 15);
/** 背包分片数。⚠ 改变即需数据迁移（09·S2），⛔ 不许随手改。 */
export const BAG_SHARDS = 4;
/** 路由桶数。⚠ 永不改（09·S2）。 */
export const BUCKETS = 16384;
/** 赛季起始 epoch 秒 / 长度秒（每赛季独立，运营配置注入）。 */
export const SEASON_BASE = envInt("SEASON_BASE", 1_782_864_000); // 2026-07-01 00:00 UTC
export const SEASON_LEN_S = envInt("SEASON_LEN_S", 30 * 86_400);
/** 冷档天数。⚠ 必须 >> max(OUTBOX_RETENTION, APPLIED_RETENTION)，且避开 30 天月度回流周期。 */
export const COLD_DAYS = 90;
/** 冻结开关：按内存水位（used_memory/maxmemory > 0.6）启用（09·F5），默认关。 */
export const FREEZE_ENABLED = process.env.FREEZE_ENABLED === "1";
/** 冻结速率 per-instance（uid/s），峰期 0。 */
export const FREEZE_RATE = envInt("FREEZE_RATE", 50);
/** 鲸鱼档字段数阈值：超过用 HSCAN 分块读（09·R1 唯一例外）。 */
export const WHALE_FIELDS = 2000;
/** 解冻速率 per-instance（uid/s）。 */
export const THAW_RATE = envInt("THAW_RATE", 1000);
/** freeze/thaw 慢操作的看门狗续租周期（09·L6：⛔ 普通写路径不加看门狗）。 */
export const LOCK_RENEW_MS = 2000;
/** active:lru:{bucket} 分片数。⚠ 改变即需数据迁移（09·S2）。 */
export const ACTIVE_LRU_BUCKETS = 256;

// ───────────────────────── 协议数字常量 ─────────────────────────

/** gameplay_outbox.status 是 TINYINT，全代码用数字（09·X4/DB6：⛔ 禁止字符串）。 */
export const OUTBOX_PENDING = 0;
export const OUTBOX_DONE = 1;
export const OUTBOX_DEAD = 2;

/** purchases.status 状态机（05）。 */
export const PURCHASE_CREATED = 0;
export const PURCHASE_PAID = 1;
export const PURCHASE_DELIVERED = 2;
export const PURCHASE_REFUNDED = 3;
export const PURCHASE_CLOSED = 4;

/** accounts.status（05）。 */
export const ACCOUNT_OK = 0;
export const ACCOUNT_BANNED_STATUS = 1;
export const ACCOUNT_DELETED = 2;

/** user_currency.currency（SMALLINT）。现阶段仅 gold。 */
export const CUR_GOLD = 1;

/** Redis 玩法档 schemaVersion 当前值（09·S1：读侧兼容 N 与 N-1）。 */
export const SCHEMA_VERSION = 1;

/** deriveOpId 的 uuidv5 namespace（固定，⛔ 永不改：改了同一 clientReqId 会派生出新 op_id 破坏幂等）。 */
export const OP_ID_NAMESPACE = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

// ── M3 鉴权（⚠ 07 表待补条目，先集中在此，禁止散落） ──────────

/** code2session HTTP 超时。 */
export const WX_TIMEOUT_MS = 3000;
/** 熔断：连续失败 N 次断路，OPEN_MS 后半开试探。 */
export const WX_BREAKER_THRESHOLD = 5;
export const WX_BREAKER_OPEN_MS = 10_000;
/** 登录限流（独立严格档，按 IP）：桶容量 / 每秒回填。 */
export const LOGIN_RATE_CAPACITY = envInt("LOGIN_RATE_CAPACITY", 5);
export const LOGIN_RATE_REFILL_PER_S = envFloat("LOGIN_RATE_REFILL_PER_S", 0.2);
/** token 明文长度（randomBytes 字节数，hex 后 ×2）。库里只存 sha256。 */
export const TOKEN_BYTES = 24;

// ── M5 网关（⚠ 07 表待补条目） ────────────────────────────────

/** ws transport 层硬上限：超限断帧不解码（09·G4；dispatcher 校验只是兜底）。 */
export const MAX_WS_PAYLOAD_BYTES = 64 * 1024;
/** RPC 限流（per-user；匿名按 sessionId，09·G5）：桶容量 / 每秒回填。env 可调（压测/联调）。 */
export const RPC_RATE_CAPACITY = envInt("RPC_RATE_CAPACITY", 20);
export const RPC_RATE_REFILL_PER_S = envFloat("RPC_RATE_REFILL_PER_S", 10);
/** handler 超时。⚠ Promise.race 无法真正取消（09·G9）：超时后 handler 仍在后台跑，
 *  关键写副作用必须靠数据层幂等/CAS 兜底，⛔ 不依赖应用层取消。 */
export const HANDLER_TIMEOUT_MS = 10_000;
