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
/** 根 env 文件里 PORT 的派生值（客户端 devEnv 生成器只认它）——用于显式 env 覆盖时的分叉警告 */
let fileDerivedPort = 2568;
{
  const envPortBeforeLoad = process.env.PORT; // 显式环境变量（loader 只填缺失键，它必然胜出）
  const rootEnvFile = join(dirname(fileURLToPath(import.meta.url)), "../../../../..", ".env.development");
  try {
    for (const line of readFileSync(rootEnvFile, "utf8").split("\n")) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m || line.trimStart().startsWith("#")) { continue; }
      if (m[1] === "PORT" && /^\d+$/.test(m[2])) { fileDerivedPort = Number(m[2]); }
      if (process.env[m[1]] === undefined) { process.env[m[1]] = m[2]; }
    }
  } catch { /* 文件不存在 = 全部走默认值 */ }
  // ⚠ PORT 被显式 env 覆盖且与文件派生值不一致：客户端 devEnv.ts 只跟随文件（生成期），
  // 双端端口将分叉——env 覆盖是合法的 12-factor 语义，但绝不允许**静默**分叉
  if (envPortBeforeLoad !== undefined && envPortBeforeLoad !== "" && envPortBeforeLoad !== String(fileDerivedPort)) {
    console.warn(
      `⚠⚠ [config] PORT 被显式环境变量覆盖为 ${envPortBeforeLoad}，但客户端 devEnv 跟随根 .env.development（${fileDerivedPort}）——` +
      `双端端口不一致，仅限临时调试；要改端口请改根 .env.development 并跑 npm run sync:client`
    );
  }
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

// 微信凭证 / code2session / 登录限流配置随登录 orchestration 迁至 WebPlatform（apps/WebPlatform/src/config.ts，
// M12c / DUAL_MODE §2.7）：wxConfig / WX_TIMEOUT_MS / WX_BREAKER_* / LOGIN_RATE_* / TOKEN_BYTES 皆在彼侧。

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

/** dev-login 开关（07 §13）：POST /account/dev-login——绕过 code2session、其余全走真实
 *  账号链路（建号/token/sess/审计）的本地登录入口。默认开发开、生产关；
 *  生产环境显式开启 = 配置事故，加载期直接拒绝启动（与 PROJECT_ID 校验同款 fail-fast）。 */
export const AUTH_DEV_ENABLED = env("AUTH_DEV_ENABLED", process.env.NODE_ENV === "production" ? "0" : "1") === "1";
if (process.env.NODE_ENV === "production" && AUTH_DEV_ENABLED) {
  throw new Error("AUTH_DEV_ENABLED=1 在生产环境被显式开启——dev-login 无微信凭证即可拿真 token，生产必须关闭");
}

/** 开发端口（根 .env.development 的 PORT 可覆盖；与 PROJECT_ID 同一套加载机制）。
 *  默认 2568：本机 2567（Colyseus 默认）常被其他项目占用；多项目并行时各项目在根
 *  .env.development 错开本值。客户端经 sync:client 从同一真源生成 core/devEnv.ts
 *  自动跟随（场景 Main.serverUrl 留空即自动，填写可覆盖）。
 *  ⚠ 严格校验（纯整数 1–65535，非法即 throw），⛔ 不用 envInt：parseInt 会把
 *  「2599junk」截成 2599，而 devEnv 生成器按纯数字正则回退默认——双方各自「容错」
 *  出不同结果 = 服务端与客户端端口静默脑裂。两侧同一规则、非法即失败。 */
export const PORT = (() => {
  const v = env("PORT", "2568");
  const n = /^\d+$/.test(v) ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`PORT 非法：「${v}」——须为 1–65535 的纯整数（devEnv 生成器同一规则，防双端端口脑裂）`);
  }
  return n;
})();

/** 本进程/组承载的区服 sId 集合（逗号分隔，如 `"1,2,3"`）。**空 = 承载全部**
 *  （单形态 / 大混服 / legacy，onAuth 不做区归属闸）。区服形态下由它做进服硬闸：
 *  join options.sId 必须 ∈ 本集合，否则拒连（防串服）。详见 docs/DUAL_MODE.md §5.1 M11 / §4.3。
 *  ⚠ 非法（非「逗号分隔的非负整数 sId」）加载期即 throw（与 PROJECT_ID/PORT 同款 fail-fast，
 *  config-guard.test 机检）。sId=0 保留大混服池。 */
export const GROUP_ZONES: readonly number[] = (() => {
  const v = process.env.GROUP_ZONES;
  if (v === undefined || v.trim() === "") { return []; }
  const out: number[] = [];
  for (const raw of v.split(",")) {
    const p = raw.trim();
    if (p === "") { continue; } // 容忍尾逗号/多余空格
    if (!/^\d+$/.test(p)) {
      throw new Error(`GROUP_ZONES 非法：「${v}」——须为逗号分隔的非负整数 sId（如 "1,2,3"；空=承载全部）。非法项「${p}」`);
    }
    const n = Number(p);
    if (!Number.isInteger(n) || n > 65535) {
      throw new Error(`GROUP_ZONES 非法：「${v}」——sId 须为 0–65535 整数，非法项「${p}」`);
    }
    out.push(n);
  }
  return out;
})();

/**
 * 进服区归属闸（docs/DUAL_MODE.md §4.3 / M11）。⛔ 客户端软判定只改善 UX，服务端此闸才是真闸。
 *
 * - `GROUP_ZONES` 空（单形态/大混服）= 承载全部 → 一律放行（含不带 sId 的老客户端，向后兼容）。
 * - `GROUP_ZONES` 非空（真区服组）→ **要求 sId 必带且 ∈ 集合**。
 *
 * ⚠ **为什么区服下缺 sId 也要拒**（M12d 评审收紧）：放行会造成两处**静默**错误 ——
 * ① `LobbyRoom` 取 `auth.sId = sId ?? 0` ⇒ 该玩家整局大厅数据落**基础前缀**而非 `s{sId}_`（串前缀）；
 * ② `GameRoom` 的 `filterBy(["sId"])` 只对**含** sId 的 join 生效 ⇒ 缺 sId 者会被撮合进任意区的房（混区）。
 * 两者都不会触发 `keys.ts` 的 fail-fast（战斗路径不碰 per-zone 键），只能在此拦。
 */
export const groupAdmitsZone = (sId: number | undefined): boolean =>
  GROUP_ZONES.length === 0 || (sId !== undefined && GROUP_ZONES.includes(sId));

export const MYSQL_URL = () => env("MYSQL_URL", `mysql://root@127.0.0.1:3316/game_${PROJECT_ID}`);
export const MYSQL_POOL_SIZE = envInt("MYSQL_POOL_SIZE", 20);

/** 账号平面实现选择（DUAL_MODE §2.7）：`in-process` 内嵌 lib / `http` 走 WebPlatform。
 *  ⚠ **未知值必须 fail-fast**：静默回退 in-process 会在 split 部署下**打错数据库**（账号表在账号库，
 *  组库里没有）——正是 `AccountClient` 接缝要防的那类静默错误。故与 PROJECT_ID/PORT 同款加载期校验。
 *  ⚠ 取值由 accountClient 在**模块加载期**求值一次，⛔ 不支持运行期切换。 */
export const ACCOUNT_MODE = (() => {
  const v = env("ACCOUNT_MODE", "in-process");
  if (v !== "in-process" && v !== "http") {
    throw new Error(
      `ACCOUNT_MODE 非法：「${v}」——只允许 "in-process"（内嵌 @game/webplatform/lib）或 "http"（走 WebPlatform 进程）。` +
      `⛔ 不静默回退：split 部署下回退到 in-process 会把账号平面的读写打在组游戏库上（静默错误，见 docs/WEBPLATFORM.md §2）`
    );
  }
  return () => v; // 保持函数形态（调用点 ACCOUNT_MODE() 不变）
})();
/** split 模式下 WebPlatform 的 HTTP 基址（httpAccount 用）。 */
export const WEBPLATFORM_BASE_URL = () => env("WEBPLATFORM_BASE_URL", "http://localhost:2570");

/** durable（noeviction + AOF everysec）与 cache（allkeys-lru）是两个物理实例（09·R4）。 */
export const REDIS_DURABLE_URL = () => env("REDIS_DURABLE_URL", "redis://127.0.0.1:6401");
export const REDIS_CACHE_URL = () => env("REDIS_CACHE_URL", "redis://127.0.0.1:6402");
export const REDIS_ROUTE_FILE = () => process.env.REDIS_ROUTE_FILE ?? "";
/** 控制总线 Redis（账号服务自持踢人消息流，DUAL_MODE §2.3）：专用 HA 实例，唯一合法跨组通道。
 *  dev 缺省**复用 durable 实例**（同实例专用流键 K_STREAM_KICK，配置驱动）；prod-split 指向物理隔离 HA Redis。
 *  ⛔ 绝不放 cache（allkeys-lru 会逐出踢人流）。 */
export const REDIS_COORD_URL = () => env("REDIS_COORD_URL", REDIS_DURABLE_URL());

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
/** GM 内部端点（`/admin/kick`）共享密钥。**未配置即端点关闭**（fail-closed；无鉴权的踢人端点 = DoS 面）。
 *  封号 SOP 的第二步靠它（DUAL_MODE §2.3）：GM 工具直连各节点踢在线并确认送达。 */
/** 组网关 → WebPlatform 的内部 HTTP 超时（在 onAuth/建角路径上；⛔ 无超时 = 黑洞挂死每个 join）。 */
export const WEBPLATFORM_TIMEOUT_MS = envInt("WEBPLATFORM_TIMEOUT_MS", 3000);

export const ADMIN_API_SECRET = () => process.env.ADMIN_API_SECRET ?? "";
/** 踢人流 MINID 兜底裁剪窗毫秒（踢是即时动作，老事件无价值；权威撤销在 accounts，M12d §2.3）。 */
export const KICK_STREAM_TRIM_MS = envInt("KICK_STREAM_TRIM_MS", 24 * 3600 * 1000);
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

// ── M3 鉴权：WX_*/LOGIN_RATE_*/TOKEN_BYTES 已迁 WebPlatform config（见上方面包屑，M12c）──────

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
