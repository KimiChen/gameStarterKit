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
