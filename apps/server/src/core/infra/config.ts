/**
 * 全部服务端常量与环境变量（[07 · 接口契约与配置](docs/SERVER.md)）。
 *
 * ⛔ 常量禁止散落在业务代码里（09 审查流程第 6 条）：新增常量/key/错误码必须先进 07 再进本文件。
 */

// ───────────────────────── 环境变量 ─────────────────────────

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 根 .env.development 加载（仅开发便利；只填 process.env 里**没有**的键，显式环境变量优先）。
// 放根而非 apps/server：PROJECT_ID 是全仓级标识，且不依赖 @colyseus/tools 的 cwd 自动加载——
// 单测/db-bootstrap/集成测试等任何入口 import 本文件即生效。
{
  const rootEnvFile = join(dirname(fileURLToPath(import.meta.url)), "../../../../..", ".env.development");
  try {
    for (const line of readFileSync(rootEnvFile, "utf8").split("\n")) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !line.trimStart().startsWith("#") && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2];
      }
    }
  } catch { /* 文件不存在 = 全部走默认值 */ }
}

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

/** 项目标识（根 .env.development 的 PROJECT_ID，缺省 gono）：多项目共用同一套本地
 *  Redis/MySQL 实例时的命名空间——Redis 键前缀 `<PROJECT_ID>_`（keys.ts 统一拼接）、
 *  MySQL 库名 `game_<PROJECT_ID>`。
 *  非法值在模块加载期直接 throw（服务端/建库/测试任何入口 import 即 fail-fast）：
 *  它会进 Redis 键名与 MySQL 库名，放宽约束 = 两套命名空间的注入面。 */
export const PROJECT_ID = (() => {
  const v = env("PROJECT_ID", "gono");
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(v)) {
    throw new Error(
      `PROJECT_ID 非法：「${v}」——须匹配 ^[a-z][a-z0-9_]{0,31}$（小写字母开头，仅小写字母/数字/下划线，总长 ≤32；它同时用作 Redis 键前缀与 MySQL 库名 game_<PROJECT_ID>）`
    );
  }
  return v;
})();
/** 全部 Redis key 的运行时前缀（07 全表登记的是逻辑键名，存储时带本前缀）。 */
export const REDIS_KEY_PREFIX = `${PROJECT_ID}_`;

/** 开发端口（根 .env.development 的 PORT 可覆盖；与 PROJECT_ID 同一套加载机制）。
 *  默认 2568：本机 2567（Colyseus 默认）常被其他项目占用；多项目并行时各项目在根
 *  .env.development 错开本值。客户端经 sync:client 从同一真源生成 core/devEnv.ts
 *  自动跟随（场景 Main.serverUrl 留空即自动，填写可覆盖）。 */
export const PORT = envInt("PORT", 2568);

export const MYSQL_URL = () => env("MYSQL_URL", `mysql://root@127.0.0.1:3316/game_${PROJECT_ID}`);
export const MYSQL_POOL_SIZE = envInt("MYSQL_POOL_SIZE", 20);

/** durable（noeviction + AOF everysec）与 cache（allkeys-lru）是两个物理实例（09·R4）。 */
export const REDIS_DURABLE_URL = () => env("REDIS_DURABLE_URL", "redis://127.0.0.1:6401");
export const REDIS_CACHE_URL = () => env("REDIS_CACHE_URL", "redis://127.0.0.1:6402");
export const REDIS_ROUTE_FILE = () => process.env.REDIS_ROUTE_FILE ?? "";

// ───────────────────────── 常量（07 全表） ─────────────────────────

/** 锁 TTL。必须 > 货币事务 p99（M0 压测定数，见 docs/SERVER.md §14）。 */
export const LOCK_TTL_MS = 5000;
/** 跨实例抢锁有界重试次数（09·L5：禁止无限递归）。 */
export const LOCK_RETRY_MAX = 3;
/** 幂等 pending 哨兵短租约（09·I1：⛔ 禁止 24h 长 TTL 毒丸）。 */
export const IDEM_PENDING_MS = 10_000;
/** 幂等结果缓存。 */
export const IDEM_RESULT_MS = 60_000;
/** sess:{uid} TTL = 3d。 */
export const SESS_TTL_S = 259_200;
/** outbox done 行保留窗（relayer 周期清理；pending/dead ⛔ 不删）。09·I5 窗口不等式的前提。 */
export const OUTBOX_RETENTION_MS = 86_400_000;
/** ⚠ 必须 ≥ 2 × OUTBOX_RETENTION_MS（09·I5），否则 relayer 重放老 intent 二次发货。 */
export const APPLIED_RETENTION_MS = 172_800_000;
export const OUTBOX_MAX_ATTEMPTS = 10;
export const RELAYER_POLL_MS = 1000;
/** relayer 只取 created_at < NOW(3) - INTERVAL 5 SECOND 的行（给同步路径留完成窗口）。
 *  env 可调（kill 测试置 0 立即可见）。 */
export const RELAYER_VISIBILITY_S = envInt("RELAYER_VISIBILITY_S", 5);
/** outbox 保留期清理周期（relayer 主循环内执行 sweepOutboxRetention）。 */
export const OUTBOX_SWEEP_INTERVAL_MS = 3_600_000;
/** singleton_lease TTL。env 可调（僵尸 worker kill 测试用短租约）。 */
export const LEASE_TTL_S = envInt("LEASE_TTL_S", 15);
/** 背包分片数。⚠ 改变即需数据迁移（09·S2），⛔ 不许随手改。 */
export const BAG_SHARDS = 4;
/** 路由桶数。⚠ 永不改（09·S2）。 */
export const BUCKETS = 16384;
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

// ── 广播/事件系统 + 事件循环防阻塞（docs/SERVER.md 2026-07，07 表已登记） ──

/** 工会事件近窗长度（capped list；窗口外客户端全量刷新，见 shared lobbyRpc/guild.ts） */
export const GUILD_EVT_LOG_MAX = envInt("GUILD_EVT_LOG_MAX", 100);
/** pushToAll 分片大小：每片之间 setImmediate 让出事件循环（单线程版「丢给 task 进程」） */
export const PUSH_ALL_CHUNK = 500;
/** handler 同步预算（生命周期内事件循环最长单次阻塞 ms，定时器探针测量——
 *  ⚠ 不用 ELU：同步块 + 同 tick 测量下 eventLoopUtilization 差值实测为 0）。
 *  超限 [rpc-budget] 告警。开发从严（写完自测第一次运行即被提醒），生产从宽 + 节流。 */
export const RPC_SYNC_BUDGET_MS = envInt("RPC_SYNC_BUDGET_MS", process.env.NODE_ENV === "production" ? 100 : 20);
/** rpc-budget 生产环境告警节流（每路由至多一条/间隔；开发环境不节流） */
export const RPC_BUDGET_WARN_INTERVAL_MS = 60_000;
/** rpc-budget 生产环境探针采样率（每请求一条 4ms 定时器链，全量开销不值得；开发全量） */
export const RPC_BUDGET_PROD_SAMPLE = envFloat("RPC_BUDGET_PROD_SAMPLE", 0.01);
/** 事件循环延迟 p99 告警阈值（loopMonitor 10s 窗口——单线程模型的「心电图」） */
export const EVENT_LOOP_ALERT_MS = envInt("EVENT_LOOP_ALERT_MS", 100);
/** MySQL 池排队（enqueue 事件）告警阈值：次/观测窗口。IO 型卡顿的共享瓶颈信号 */
export const MYSQL_QUEUE_ALERT = envInt("MYSQL_QUEUE_ALERT", 5);
/** worker_threads 计算池大小（铁律 11 的卸载点；0/负数视为 1） */
export const COMPUTE_POOL_SIZE = envInt("COMPUTE_POOL_SIZE", 2);
/** 计算池单任务超时：超时 reject 并终止换新 worker（线程无法安全打断，只能弃车） */
export const COMPUTE_TASK_TIMEOUT_MS = envInt("COMPUTE_TASK_TIMEOUT_MS", 30_000);
