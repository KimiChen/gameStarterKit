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
