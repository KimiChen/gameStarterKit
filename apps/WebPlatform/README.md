# apps/WebPlatform — 平台门户服务（MySQL-only）

DUAL_MODE [§2.7](../../docs/DUAL_MODE.md)。**门户 = 目录 + 身份权威 + 只读投影**，zone-aware
但不拥有权威玩法态、不跑区逻辑。⛔ **MySQL-only，无 Redis、无缓存**（`verify` 一条 PK SELECT）。

## 部署模式（deploy-mode，去 big-bang 风险）

同一份账号逻辑，两种跑法：

- **dev/test 内嵌**：`apps/server` 的 `inProcessAccount` 直接 import 本包 `src/lib/`，**不起本进程、不走 HTTP**。74 int 测试不改。
- **prod split**：本包 `src/index.ts`（Fastify）作独立进程起 HTTP；`apps/server` 的 `httpAccount` 走 HTTP 指向它。

## 目录

- `src/lib/` — 账号逻辑：MySQL-only、**零 HTTP**，可被 apps/server 内嵌 import。
  - `mysql.ts` — 自己的池（dev 缺省与游戏服共库、split 独立）。
  - `auth/`、`character.ts` — 随 2b-2-ii 从 apps/server 迁入的 MySQL 部分。
- `src/index.ts` — Fastify entry（仅 split）；端点包 `lib/`。
- `src/config.ts` — `WEBPLATFORM_MYSQL_URL` / 端口。

## 承载（迁入后）

身份 accounts/seq/login_audit + token 记录、char_registry、login/verify/ban、
character.register/query/bindProfile/bindPhone、`/area/list` 目录。⛔ Redis 缓存/快路径留 apps/server 组侧。
