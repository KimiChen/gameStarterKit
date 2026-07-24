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
