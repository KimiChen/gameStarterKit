/**
 * 全部服务端常量与环境变量（登记点与开发约束见 docs/SERVER.md §12–§13）。
 *
 * ⛔ 常量禁止散落在业务代码里：新增常量/key/错误码必须先更新契约与登记点，再进本文件。
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
  if (v === undefined || v === "") { return dflt; }
  if (!/^\d+$/.test(v)) {
    throw new Error(`${name} 非法：「${v}」——须为非负整数`);
  }
  const n = Number(v);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`${name} 非法：「${v}」——超出安全整数范围`);
  }
  return n;
};
// 速率类常量必须用它：宽松 parseFloat 会把尾随垃圾截掉并制造静默配置分叉
const envFloat = (name: string, dflt: number): number => {
  const v = process.env[name];
  if (v === undefined || v === "") { return dflt; }
  if (!/^\d+(?:\.\d+)?$/.test(v)) {
    throw new Error(`${name} 非法：「${v}」——须为非负十进制数`);
  }
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`${name} 非法：「${v}」——必须是有限数`);
  }
  return n;
};

// 微信凭证 / code2session / 登录限流属于独立 WebPlatform，游戏进程不读取这些配置。

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
/** 全部 Redis key 的运行时前缀（文档登记的是逻辑键名，存储时带本前缀）。 */
export const REDIS_KEY_PREFIX = `${PROJECT_ID}_`;

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
 * 规范化来自网络/HTTP 边界的区号。缺省表示大混服 s0；其余值必须是 0..65535 整数。
 *
 * 返回 `null` 表示非法，而不是在这里直接抛业务错误：GameRoom/LobbyRoom 都要把它映射成
 * `WrongServer`，配置/工具侧则可以选择自己的错误边界。⛔ TypeScript 的 `number` 标注不是
 * 运行时校验；尤其 GROUP_ZONES 为空时 `groupAdmitsZone` 会承载全部区，入口必须先走本函数。
 */
export const normalizeSId = (raw: unknown): number | null => {
  if (raw === undefined) { return 0; }
  return typeof raw === "number"
    && Number.isInteger(raw)
    && raw >= 0
    && raw <= 65535
    ? raw
    : null;
};

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

/**
 * 游戏服只通过 WebPlatform Internal HTTP 访问账号权威。这里没有模式开关，也没有账号库 DSN：
 * URL/服务身份任一配错都应明确失败，绝不能回退到进程内实现或游戏库。
 */
export const WEBPLATFORM_INTERNAL_URL = (() => {
  const raw = env("WEBPLATFORM_INTERNAL_URL", "http://127.0.0.1:2571");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`WEBPLATFORM_INTERNAL_URL 非法：「${raw}」`);
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:")
    || url.username !== "" || url.password !== ""
    || url.search !== "" || url.hash !== ""
    || (url.pathname !== "" && url.pathname !== "/")) {
    throw new Error(
      "WEBPLATFORM_INTERNAL_URL 必须是无凭据、无 path/query/hash 的 http(s) origin"
      + `，实际「${raw}」`,
    );
  }
  return url.origin;
})();

export const WEBPLATFORM_SERVICE_ID = (() => {
  const v = env("WEBPLATFORM_SERVICE_ID", "game-server");
  if (!/^[a-zA-Z0-9_.:-]{1,64}$/.test(v)) {
    throw new Error(`WEBPLATFORM_SERVICE_ID 非法：「${v}」`);
  }
  return v;
})();

export const WEBPLATFORM_SERVICE_SECRET = (() => {
  const v = env(
    "WEBPLATFORM_SERVICE_SECRET",
    process.env.NODE_ENV === "production" ? undefined : "dev-service-secret",
  );
  if (v.length > 512) {
    throw new Error("WEBPLATFORM_SERVICE_SECRET 过长（上限 512 字符）");
  }
  return v;
})();

const webPlatformPositiveInt = (name: string, dflt: number, max: number): number => {
  const raw = env(name, String(dflt));
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} 非法：「${raw}」——须为正整数`);
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1 || n > max) {
    throw new Error(`${name} 非法：「${raw}」——须在 1..${max}`);
  }
  return n;
};

/** TCP/TLS 建连与整次逻辑调用（含一次重试）的预算。 */
export const WEBPLATFORM_CONNECT_TIMEOUT_MS =
  webPlatformPositiveInt("WEBPLATFORM_CONNECT_TIMEOUT_MS", 200, 30_000);
export const WEBPLATFORM_REQUEST_TIMEOUT_MS =
  webPlatformPositiveInt("WEBPLATFORM_REQUEST_TIMEOUT_MS", 1_000, 60_000);
if (WEBPLATFORM_CONNECT_TIMEOUT_MS > WEBPLATFORM_REQUEST_TIMEOUT_MS) {
  throw new Error("WEBPLATFORM_CONNECT_TIMEOUT_MS 不得大于 WEBPLATFORM_REQUEST_TIMEOUT_MS");
}

/** 连续基础设施失败达到阈值后短暂打开；半开期只允许一个探测请求。 */
export const WEBPLATFORM_BREAKER_FAILURES =
  webPlatformPositiveInt("WEBPLATFORM_BREAKER_FAILURES", 5, 1_000);
export const WEBPLATFORM_BREAKER_OPEN_MS =
  webPlatformPositiveInt("WEBPLATFORM_BREAKER_OPEN_MS", 5_000, 300_000);

/** WebPlatform 角色登记 durable repair（GAME-6）：网关内轻量 IO worker，多实例允许幂等重复。 */
export const CHARACTER_REPAIR_POLL_MS =
  webPlatformPositiveInt("CHARACTER_REPAIR_POLL_MS", 1_000, 300_000);
export const CHARACTER_REPAIR_BATCH_SIZE =
  webPlatformPositiveInt("CHARACTER_REPAIR_BATCH_SIZE", 20, 1_000);
export const CHARACTER_REPAIR_CONCURRENCY =
  webPlatformPositiveInt("CHARACTER_REPAIR_CONCURRENCY", 4, 100);
export const CHARACTER_REPAIR_BACKOFF_BASE_MS =
  webPlatformPositiveInt("CHARACTER_REPAIR_BACKOFF_BASE_MS", 1_000, 300_000);
export const CHARACTER_REPAIR_BACKOFF_MAX_MS =
  webPlatformPositiveInt("CHARACTER_REPAIR_BACKOFF_MAX_MS", 300_000, 86_400_000);
if (CHARACTER_REPAIR_BACKOFF_BASE_MS > CHARACTER_REPAIR_BACKOFF_MAX_MS) {
  throw new Error("CHARACTER_REPAIR_BACKOFF_BASE_MS 不得大于 CHARACTER_REPAIR_BACKOFF_MAX_MS");
}
export const CHARACTER_REPAIR_ALERT_ATTEMPTS =
  webPlatformPositiveInt("CHARACTER_REPAIR_ALERT_ATTEMPTS", 5, 1_000_000);

/**
 * 首次进区建角的有界 ready 预算。建角包含 Redis/SQL 冷档判定和 WebPlatform
 * 登记，不能让一个失联的外部服务把大厅 seat 永久卡在半状态。
 */
export const CHARACTER_READY_TIMEOUT_MS =
  webPlatformPositiveInt("CHARACTER_READY_TIMEOUT_MS", 10_000, 120_000);

/** 支付链总开关（缺省**关**）：关 ⇒ `/pay/wx-notify` 直接 501「未上线」。
 *  ⚠ 支付链现在不具备上线条件（无下单端点、共享密钥而非 APIv3 验签、无对账，见 docs/EXTRAFEATURES.md §3.4），
 *  这个开关是**防误开**，⛔ 不是"配上就能收钱"。每请求现读（同 ADMIN_API_SECRET 范式，便于灰度）。 */
export const PAY_ENABLED = () => process.env.PAY_ENABLED === "1";
/** ⚠ **生产开启 = 配置事故，加载期拒绝启动**（与本文件 FREEZE_ENABLED 同款：缺省关 + 生产显式开启即加载期拒绝启动）。
 *  评审逮到：缺省关只是"软开关"——`NODE_ENV=production PAY_ENABLED=1` 照样能起，然后
 *  `/pay/wx-notify` 只剩一道**共享密钥占位**（⛔ 非 APIv3 平台证书验签，密钥泄漏即可伪造发货），
 *  而它后面接的是**真发币**（`purchases.ts`：paid CAS → `currency_ledger` 正向 delta → delivered）。
 *  ⇒ 在 APIv3 验签 / 下单出口 / 对账三者闭环之前，生产环境**不允许**开启，⛔ 不是"默认关就够了"。
 *  灰度/联调请在非生产 NODE_ENV 下做。 */
if (process.env.NODE_ENV === "production" && process.env.PAY_ENABLED === "1") {
  throw new Error(
    "PAY_ENABLED=1 在生产环境被显式开启——支付链尚未闭环（无下单端点、共享密钥而非 APIv3 验签、无对账，"
    + "见 docs/EXTRAFEATURES.md §3.4），而 /pay/wx-notify 后面是真发币路径。补齐三项之前生产必须关闭。");
}

/** durable（noeviction + AOF everysec）与 cache（allkeys-lru）是两个物理实例（09·R4）。 */
export const REDIS_DURABLE_URL = () => env("REDIS_DURABLE_URL", "redis://127.0.0.1:6401");
export const REDIS_CACHE_URL = () => env("REDIS_CACHE_URL", "redis://127.0.0.1:6402");
export const REDIS_ROUTE_FILE = () => process.env.REDIS_ROUTE_FILE ?? "";
/** 控制总线 Redis（踢人消息流，DUAL_MODE §2.3）：专用 HA 实例。
 *  ⚠ **扇出半径只到本组**——coord 按组独占（M14 起 driver/presence 也挂它），⛔ 不是跨组通道
 *  （此处曾写"唯一合法跨组通道"，与 kickBus.ts / redisRoute.ts 已收口的「本组 coord」口径打架）。
 *  跨组送达与顶号限制见 docs/EXTRAFEATURES.md §3.2；当前 kick bus 不提供跨组送达保证。
 *  dev 缺省**复用 durable 实例**（同实例专用流键 K_STREAM_KICK，配置驱动）；prod-split 指向物理隔离 HA Redis。
 *  ⛔ 绝不放 cache（allkeys-lru 会逐出踢人流）。 */
export const REDIS_COORD_URL = () => env("REDIS_COORD_URL", REDIS_DURABLE_URL());

// ───────────────────────── 常量 ─────────────────────────

/** 锁 TTL。必须 > 货币事务 p99（M0 压测定数，见 apps/server/tools/m0/currency-txn-bench.ts）。 */
export const LOCK_TTL_MS = 5000;
/** 跨实例抢锁有界重试次数（09·L5：禁止无限递归）。 */
export const LOCK_RETRY_MAX = 3;
/** 幂等 pending 哨兵短租约；必须显著覆盖 handler 的最大执行窗口，避免迟到写与立即重试并发。 */
export const IDEM_PENDING_MS = 30_000;
/** 幂等结果缓存。 */
export const IDEM_RESULT_MS = 60_000;
/** sess:{uid} TTL = 3d。 */
export const SESS_TTL_S = 259_200;
/** GM 内部端点（`/admin/kick`）共享密钥。**未配置即端点关闭**（fail-closed；无鉴权的踢人端点 = DoS 面）。
 *  封号 SOP 的第二步靠它（DUAL_MODE §2.3）：GM 工具直连各节点踢在线并确认送达。 */
export const ADMIN_API_SECRET = () => process.env.ADMIN_API_SECRET ?? "";
/** 踢人流 MINID 兜底裁剪窗毫秒（踢是即时动作，老事件无价值；权威撤销在 WebPlatform）。 */
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
/**
 * 冻结开关：按内存水位（used_memory/maxmemory > 0.6）启用（09·F5），默认关。
 *
 * ⚠ **archive 步补齐前，freeze 在任何配置下都不安全，故加载期 fail-fast**（DUAL_MODE archive 步）。
 * 判据不是"是否多区"——⛔ **上一版这道闸把判据写成 `GROUP_ZONES.length > 0` 就抛，两边都反了**
 * （评审逮到）。实测事实：
 *   - `GROUP_ZONES` **非空** ⇒ freezeWorker 在**运行期**就崩：它不在 `zoneCtx.run` 内（archive/ 全目录
 *     零 zoneCtx），而 `kUser` 走 `P()` ⇒ `currentZoneId()` 命中 keys.ts 的 fail-fast 抛错。
 *     所以这一侧 freeze 本来就跑不起来，旧闸拦的是**空档**。
 *   - `GROUP_ZONES` **空** ⇒ freeze 真能跑，而这一侧才是**唯一会坏数据**的：`kActiveLru` 用**全局**
 *     前缀 `G`、`kUser` 用**区**前缀 `P()` ⇒ 在 s1 玩过的 uid 出现在全局 LRU 里，worker（sId=0）
 *     去查 `prefix_user:{uid}` 查不到，于是按 freezeWorker 的**幽灵项**分支把这个**活人**从活跃
 *     索引里 `ZREM` 掉。旧闸恰恰放行了它，还有绿测试把它钉成"合法组合"。
 * ⇒ 结论：⛔ 别再试图用「单区/多区」区分安全性。补齐 archive 步（`user_archive` 加 server_id、
 *   `active:lru` 区化、worker 进 zoneCtx）之前，唯一安全值是 0。
 * ⚠ 逃生口 `FREEZE_UNSAFE_S0_ONLY=1` 仅给"目录确实不下发任何 s≥1、全库只有 s0"的部署
 *   （默认目录下发 s1–s5，⛔ 缺省不满足）；命名带 UNSAFE 是刻意的，⛔ 别用它绕过上面的结论。
 */
export const FREEZE_ENABLED = (() => {
  const on = process.env.FREEZE_ENABLED === "1";
  if (on && process.env.FREEZE_UNSAFE_S0_ONLY !== "1") {
    throw new Error(
      "FREEZE_ENABLED=1 但 archive 步未补齐（DUAL_MODE archive 步）——freeze 目前在任何配置下都不安全："
      + `GROUP_ZONES 非空（当前「${process.env.GROUP_ZONES ?? ""}」）时 freezeWorker 运行期即崩（keys.ts `
      + "zoneCtx fail-fast）；GROUP_ZONES 空时 active:lru 是全局键而 user 档是区键 ⇒ 在 s≥1 玩过的活人"
      + "会被当幽灵项从活跃索引 ZREM 掉。补齐前唯一安全值是 FREEZE_ENABLED=0。"
      + "（确认本部署只有 s0、目录不下发任何 s≥1，才可加 FREEZE_UNSAFE_S0_ONLY=1 显式放行）");
  }
  return on;
})();
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

/** user_currency.currency（SMALLINT）。现阶段仅 gold。 */
export const CUR_GOLD = 1;

/** Redis 玩法档 schemaVersion 当前值（09·S1：读侧兼容 N 与 N-1）。 */
export const SCHEMA_VERSION = 1;

/** deriveOpId 的 uuidv5 namespace（固定，⛔ 永不改：改了同一 clientReqId 会派生出新 op_id 破坏幂等）。 */
export const OP_ID_NAMESPACE = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

// ── M3 鉴权：WX_*/LOGIN_RATE_*/TOKEN_BYTES 已迁 WebPlatform config（见上方面包屑，M12c）──────

// ── M5 网关（登记点见 docs/SERVER.md §13） ────────────────────────────────

/** ws transport 层硬上限：超限断帧不解码（09·G4；dispatcher 校验只是兜底）。 */
export const MAX_WS_PAYLOAD_BYTES = 64 * 1024;
/** RPC 限流（per-user；匿名按 sessionId，09·G5）：桶容量 / 每秒回填。env 可调（压测/联调）。 */
export const RPC_RATE_CAPACITY = envInt("RPC_RATE_CAPACITY", 20);
export const RPC_RATE_REFILL_PER_S = envFloat("RPC_RATE_REFILL_PER_S", 10);
/** handler 超时。⚠ Promise.race 无法真正取消（09·G9）：超时后 handler 仍在后台跑，
 *  关键写副作用必须靠数据层幂等/CAS 兜底，⛔ 不依赖应用层取消。 */
export const HANDLER_TIMEOUT_MS = 10_000;

// ── 广播/事件系统 + 事件循环防阻塞（见 docs/SERVER.md §10 广播与事件、§11 计算任务） ──

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
/** 计算池最多保留的排队任务数；满载时以稳定 overload 错误快速拒绝。 */
export const COMPUTE_QUEUE_CAPACITY =
  webPlatformPositiveInt("COMPUTE_QUEUE_CAPACITY", 100, 100_000);
