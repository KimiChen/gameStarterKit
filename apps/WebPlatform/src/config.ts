/**
 * WebPlatform 配置（DUAL_MODE §2.7）。**MySQL-only、⛔ 无 Redis、无缓存**。
 * dev/test 内嵌时默认与游戏服共库（同 game_<PROJECT_ID>）；prod-split 时指向自己的库。
 */
const PROJECT_ID = process.env.PROJECT_ID ?? "gono";

/** WebPlatform 自己的 MySQL（dev 缺省 = 游戏服同库；split 时独立库）。 */
export const WEBPLATFORM_MYSQL_URL = (): string =>
  process.env.WEBPLATFORM_MYSQL_URL
  ?? process.env.MYSQL_URL
  ?? `mysql://root@127.0.0.1:3316/game_${PROJECT_ID}`;

/** prod-split HTTP entry 端口（dev/test 内嵌不起 HTTP，此值不用）。 */
export const WEBPLATFORM_PORT = Number(process.env.WEBPLATFORM_PORT ?? 2570);

/**
 * 是否位于**可信前置代理**之后 —— 为真才采信 `X-Forwarded-For` 取真实 IP。**缺省真**。
 *
 * ⚠ **缺省为真不是疏忽，是因为「缺省为假」在本文件唯一会跑的拓扑里必然出事**：
 * 起本进程 = `ACCOUNT_MODE=http`（split），而 split 的客户端是经 LB 打进来的 ⇒ 不采信 XFF 时
 * `req.ip` 对所有玩家都等于 **LB 的地址**，全服塌缩进**同一个**令牌桶（容量 5 / 补 0.2 每秒
 * = **全服 12 次登录/分钟**），既是开服即挂，也正是 09·G5 明令禁止的「共享 key 连坐」。
 * 用一个必然的可用性事故去换一个本该由别处解决的安全问题，不划算。
 *
 * ⚠ **那个安全问题由 W1 负责，不由本开关负责**：直连者能自带任意 XFF（连"最右段"也是他写的），
 * 从而绕过登录限流、烧 code2session 配额、放大审计写入。防它的正确位置是
 * **W1「端点鉴权分层 + 绑定内网」**（docs/WEBPLATFORM.md §4，上线前必做）——即**别让人直连到**。
 * 若某部署确实把本进程直接暴露且 W1 尚未落地，显式置 `WEBPLATFORM_TRUST_PROXY=0` 换回严格模式，
 * 但要接受"全服共桶"的代价。每请求现读，便于运维热改。
 */
export const TRUST_PROXY = (): boolean => process.env.WEBPLATFORM_TRUST_PROXY !== "0";

/** 不透明 token 随机字节数（→ 2× hex）。⚠ 与 apps/server 一致（认证契约值，勿漂移）。 */
export const TOKEN_BYTES = 24;
/** token 时效秒（默认 3d）。verify 用它判过期。⚠ 与 apps/server SESS_TTL_S 一致。 */
export const SESS_TTL_S = 259_200;

/** 微信 code2session 配置（登录用）。 */
export const wxConfig = () => ({
  appid: process.env.WX_APPID ?? "",
  secret: process.env.WX_SECRET ?? "",
  code2sessionUrl: process.env.WX_CODE2SESSION_URL ?? "https://api.weixin.qq.com/sns/jscode2session",
});
export const WX_TIMEOUT_MS = 3000;
export const WX_BREAKER_THRESHOLD = 5;
export const WX_BREAKER_OPEN_MS = 10_000;
/** 登录限流（进程内令牌桶，per WebPlatform 实例；规模化靠前置 LB 按 IP，§2.7）。 */
export const LOGIN_RATE_CAPACITY = Number(process.env.LOGIN_RATE_CAPACITY ?? 5);
export const LOGIN_RATE_REFILL_PER_S = Number(process.env.LOGIN_RATE_REFILL_PER_S ?? 0.2);

/** dev-login 开关（split 模式 /dev-login 用）：默认开发开、生产关；生产显式开启 = 加载期拒绝启动
 *  （与 apps/server 同款 fail-fast：dev-login 无微信凭证即拿真 token）。in-process 时门控在 apps/server。 */
export const AUTH_DEV_ENABLED =
  (process.env.AUTH_DEV_ENABLED ?? (process.env.NODE_ENV === "production" ? "0" : "1")) === "1";
if (process.env.NODE_ENV === "production" && AUTH_DEV_ENABLED) {
  throw new Error("AUTH_DEV_ENABLED=1 在生产环境被显式开启——dev-login 无微信凭证即可拿真 token，生产必须关闭");
}
