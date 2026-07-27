# 交接：WebPlatform HTTP-only 拆仓

> 原文件记录 M12 过渡架构。2026-07-27 的 breaking change 已将其收口为
> **独立 `gono-webplatform` 仓 + 独立账号库 + Public/Internal/Admin HTTP**。
> 本文是当前接手入口；旧双模式推导只在 Git 历史与 `REVIEW-2026-07.md` 留档，不构成部署选项。

## 1. 已确认前提

- 线上无业务流量、无旧客户端、无账号数据需要迁移。
- 账号库由独立仓 migration 从空库初始化，不做兼容 API、双写、CDC 或回填。
- WebPlatform 只通过 HTTP 提供服务，不发布业务源码给游戏仓直调。
- 当前是一游戏一 WebPlatform、一游戏一账号库，不做跨游戏中心账号。
- WebPlatform 不接游戏 Redis、不运行玩法逻辑、不负责踢在线广播。

## 2. 当前拓扑与所有权

```text
客户端 ──Public HTTPS──> gono-webplatform ──> WebPlatform MySQL
游戏服 ──Internal HTTP─┘
GM 工具 ──Admin HTTP───┘
GM 工具 ──逐节点 /admin/kick──> 游戏服节点

游戏服 ──> 游戏组 MySQL + Redis
```

独立仓拥有 OpenAPI、账号领域、微信登录、选服目录、Admin 操作、账号表 migration、测试和镜像。
游戏仓拥有玩法、组 session cache、同区顶号、在线表、节点 kick 端点和唯一 Internal HTTP client。

账号表 `accounts`、`account_sessions`、`char_registry`、`login_audit`、`seq` 只在 WebPlatform 数据库。
游戏库 bootstrap 不得创建它们，游戏进程不得持有账号库凭证。

## 3. 游戏仓交付地图

### 3.1 契约

- 精确锁定 `@gono/webplatform-contract`，来源为独立仓 OpenAPI 生成物。
- `scripts/sync-webplatform-contract.mjs` 将零依赖路径/类型镜像到
  `apps/shared/src/generated/webplatform/`，manifest 记录版本与 hash。
- `npm run sync:webplatform-contract` 级联 `shared → client → Cocos`。
- `npm run verify:webplatform-contract` 挂在根 `typecheck` 前，漂移立即失败。

### 3.2 客户端

| 落点 | 当前职责 |
|---|---|
| `Main.portalUrl` | WebPlatform Public origin，**必填**；空值/非法值 fail-fast，不回退游戏服 |
| `net/http/account.ts` | `POST /v1/sessions/dev`、`POST /v1/sessions/wechat` |
| `net/http/area.ts` | `GET /v1/areas`；已有 token 时自动带 Bearer |
| `net/serverSession.ts` | 保存 `servers/myServerIds/hash` 与当前 `serverId`、`gameHttpUrl/gameWsUrl` |
| `logic/areaDirectory.ts` | 目录 UX 判定；不替代游戏服准入硬闸 |

登录成功字段是 `userId/accessToken/isNewAccount`。区服字段是
`serverId/name/tag/status/openTime/gameHttpUrl/gameWsUrl`。进入游戏服时只在边界把
`serverId` 转成现有 Colyseus join option `sId`；大厅和战斗都使用目录的 `gameHttpUrl`。

### 3.3 游戏服

| 落点 | 当前职责 |
|---|---|
| `src/platform/webPlatformClient.ts` | 唯一 Internal HTTP client：verify、register character、has character |
| `core/auth/session.ts` | 组侧 Redis session cache、`issuedAtMs` 栅栏、同区顶号 |
| `rooms/GameRoom.ts` / `websocket/LobbyRoom.ts` | 建连时 strict verify；每消息只走组缓存快路径 |
| `player/character.ts` | 先确保游戏档，再用 Internal API 幂等登记角色 |
| `core/archive/thaw.ts` | ABSENT 时用 Internal `hasCharacter` 做 F4 判据 |
| `http/admin/kick.ts` | GM 逐节点踢在线；不写账号权威 |

游戏服没有登录/选服/ban/revoke 兼容端点，也没有账号领域本地实现。生产源码边界测试绝对禁止
旧账号包、旧源码目录、运行期账号模式开关与连接池注入。

## 4. 三个必须保持的模型

### 4.1 strict verify 与组缓存

建连时游戏服调用：

```text
POST /v1/internal/sessions/verify
x-service-id + x-service-secret
{accessToken, serverId}
```

- `valid:true` 返回的 `userId` 是游戏服唯一可信身份来源。
- `issuedAtMs` 来自账号库，是 `writeGroupSess` 的单调栅栏；不得换成游戏进程 `Date.now()`。
- `valid:false` 才映射玩家鉴权失败。
- Internal 401/403、超时、5xx、熔断和契约漂移是基础设施/配置错误，⛔ 不得伪装成 token 过期。
- 组缓存写入仍有 `written/unchanged/stale` 三态；`stale` 必须拒绝本次准入。

每条 Lobby RPC 只比对组缓存 token hash，避免逐消息回源。这个性能设计意味着账号权威变更不会自动
使既有连接下线，因此 GM 两步 SOP 不可省略。

### 4.2 单端语义

权威 session 的主键是 `(userId, serverId)`：

- 同区重新登录替换旧 token，并由组侧踢掉旧登录态；
- 不同区 session 互不影响；
- ban 是账号级：独立仓事务内 `accounts.status=1` 并删除全部区 session；
- revoke 只删除全部区 session，不改变正常账号状态。

token 对所有调用方都不透明，不从 token 文本反解 uid 或区号。

### 4.3 封号/撤销两步 SOP

```text
① GM → WebPlatform Admin HTTP：写权威 + 审计（必须先成功）
② GM → 每一个在役游戏节点 /admin/kick：逐节点确认 HTTP 200
```

Admin 路径为：

- `POST /v1/admin/accounts/{userId}/ban`
- `POST /v1/admin/accounts/{userId}/revoke`

请求带 `operationId/reason`，头带 `x-admin-secret/x-operator-id`。详细重试、节点清单和验收见
[GM-TOOL-SPEC.md](GM-TOOL-SPEC.md)。

## 5. 配置

游戏服只读取：

| 变量 | 说明 |
|---|---|
| `WEBPLATFORM_INTERNAL_URL` | Internal http(s) origin；不得含凭据/path/query/hash |
| `WEBPLATFORM_SERVICE_ID` | Internal 调用方 ID |
| `WEBPLATFORM_SERVICE_SECRET` | Internal 服务密钥 |
| `WEBPLATFORM_CONNECT_TIMEOUT_MS` | 建连超时 |
| `WEBPLATFORM_REQUEST_TIMEOUT_MS` | 总请求预算 |
| `WEBPLATFORM_BREAKER_FAILURES` | 熔断阈值 |
| `WEBPLATFORM_BREAKER_OPEN_MS` | 熔断窗口 |
| `ADMIN_API_SECRET` | 游戏节点 `/admin/kick` 密钥；空值关闭端点 |

客户端场景 `Main.portalUrl` 指向 **Public** origin；本地示例
`http://127.0.0.1:2570`，生产必须 HTTPS。游戏服 `WEBPLATFORM_INTERNAL_URL` 指向 **Internal**
origin；本地约定通常为 `http://127.0.0.1:2571`。

账号库 DSN、Public/Internal/Admin 监听、微信凭证与 Admin 密钥属于独立仓部署配置，本仓不定义或回退。

## 6. 本地联调与部署

1. 在独立仓初始化空账号库、执行 migration，并启动 Public/Internal HTTP。
2. 本仓启动游戏 Redis/MySQL 栈并执行游戏库 bootstrap。
3. 配置游戏服 Internal URL/服务身份后运行 `npm run dev`。
4. 在 Cocos 场景填写 `Main.portalUrl` 后预览。

生产是两个独立发布单元：

- `gono-webplatform`：独立镜像、migration job、账号库凭证与 Public/Internal/Admin 网络策略；
- `gonoGame`：网关及游戏 workers、游戏库/Redis、WebPlatform Internal 客户端配置。

WebPlatform readiness 必须校验账号库与 schema 版本；游戏网关 readiness 应把必需依赖状态纳入发布门槛。
游戏服安全组不得访问账号数据库，WebPlatform 安全组不得访问游戏数据库或 Redis。

## 7. 机检与测试

| 守门 | 保护内容 |
|---|---|
| `lib-import-ban.test.ts` | 生产源码不得重新耦合旧包/源码目录/模式开关/池注入 |
| `db-bootstrap.test.ts` | 游戏库不得创建账号表 |
| `verify:webplatform-contract` | 契约版本/hash 与 shared 生成物一致 |
| 客户端 HTTP/页面单测 | v1 路径、Bearer、字段和 `portalUrl` fail-fast |
| 独立仓 contract/integration | OpenAPI、账号事务、Admin 幂等与账号库 migration |

游戏仓的 strict onAuth、`ensureCharacter`、F4 测试需要一个契约一致的 WebPlatform HTTP test double
或可 reset 的 client/factory 注入。⛔ 不得为了造数据重新 import 独立仓源码或向账号表直写 SQL。

## 8. 退役历史与阅读规则

M12 曾用 monorepo 业务包、游戏进程内账号实现和 HTTP 实现并存来降低迁移风险。该过渡期已经结束：

- `apps/WebPlatform` 不再是 workspace、启动入口或依赖目标；
- `@game/webplatform` 不再是游戏服依赖；
- `ACCOUNT_MODE`、进程内实现、游戏池注入和共库运行均已删除；
- 客户端 portal 地址不再允许留空回退；
- 原过渡期共进程测试与直接账号 SQL 测试已删除，账号领域测试归独立仓。

若旧 commit、`REVIEW-2026-07.md` 或历史设计稿与本文冲突，以本文、
[WEBPLATFORM.md](WEBPLATFORM.md) 和当前契约包为准。历史记录可以解释“为什么演进”，不能指导新代码。

## 9. 已知边界

- 已在战斗房中的玩家不会逐消息回源；Admin 写权威后仍依赖 GM 逐节点 kick。发奖等高价值边界应再次
  校验账号状态（落地时按独立仓 Internal 契约扩展）。
- WebPlatform 不持游戏节点在线表，无法替 GM 证明“所有节点都已踢”。
- 目录状态是展示投影，不是准入真相；绕过客户端直连仍由游戏服判断。
- 当前不做跨游戏账号、多设备同区并存、动态目录后台和完整账号画像产品能力。
