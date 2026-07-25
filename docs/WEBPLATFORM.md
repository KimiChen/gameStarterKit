# WebPlatform：平台门户服务（账号 plane）

> **本文是 WebPlatform 的设计契约 + 待办账本。** 代码导览见就近 [apps/WebPlatform/README.md](../apps/WebPlatform/README.md)；
> 它在双形态架构中的位置见 [DUAL_MODE §2.7](DUAL_MODE.md)；组网关侧的规则见 [SERVER.md §12](SERVER.md)。

## 1. 定位：门户 = 目录 + 身份权威 + 只读投影

**zone-aware**（serve 服务器列表、按区存角色展示数据），但**不拥有权威玩法态、不跑区逻辑**。
⛔ **MySQL-only：无 Redis、无缓存**（`verify` 就是一条 PK SELECT）。组侧的 Redis 快路径/组缓存留在 `apps/server`。

| 承载 | 不承载 |
|---|---|
| `accounts`（openid→uid、status、token 记录、画像列）、`seq`、`login_audit` | 玩法档（Redis `user:{uid}`，组侧真源） |
| `char_registry`（「uid 在哪些区建过角」的存在性权威 + 展示投影） | 每区经济（`user_currency` 等，组库） |
| 登录编排（限流 → code2session → 查/建号 → 签发 token） | 组 `sess:{uid}` 缓存、踢在线（组侧 + GM 工具） |
| 选服目录 `/area/list`（`al`/`wsUrl`/`isOps`/`h` + `ul`） | 控制总线 `stream:kick`（coord Redis 在组侧） |

## 2. 部署模式（deploy-mode，去 big-bang 风险）

同一份账号逻辑两种跑法，由组网关的 `ACCOUNT_MODE` 选择：

| 模式 | 账号逻辑在哪 | 库 | 客户端登录/选服打谁 |
|---|---|---|---|
| `in-process`（dev/test 缺省） | `apps/server` 直接 import `@game/webplatform/lib`，⛔ 不起本进程 | 与游戏服**共库** | 游戏服（`portalUrl` 留空回退） |
| `http`（prod split） | 本包 `src/index.ts`（Fastify）独立进程 | **独立账号库** `WEBPLATFORM_MYSQL_URL` | WebPlatform（客户端 `portalUrl`） |

### ⚠ split 的第一性约束：游戏服进程里**直调 lib 就是打错库**

`apps/server/src/core/infra/mysql.ts` 无条件把**游戏服的池**注入给 lib（`useServerPool`）。
所以 split 下，游戏服进程里任何对 `@game/webplatform/lib` 的直接调用都会打在**组游戏库**上——
那里没有 `accounts`/`char_registry`，结果是**静默错误**（`affectedRows=0`、查询空集），而非报错。

> **`AccountClient` 接缝（`platform/accountClient.ts`）的存在就是为了防这个**：游戏服要访问账号/门户平面，
> **一律走 `account.*`**（in-process → lib、split → HTTP）。⛔ 禁止在 `platform/` 之外 import lib
> （唯一例外：`core/infra/mysql.ts` 的池注入）。此约束由 `test/lib-import-ban.test.ts` 机检（白名单：`platform/**` + `core/infra/mysql.ts`）。

## 3. 端点清单

| 端点 | 暴露面 | 说明 |
|---|---|---|
| `GET /healthz` | 公开 | 进程存活 + MySQL 可达 |
| `POST /account/wx-login`·`/account/dev-login` | 公开（客户端直连） | 路径 = 单源 `ApiPath`（铁律 6）；出参 shared `ILoginRes`，⛔ 禁含 openid/session_key（09·G8） |
| `POST /area/list` | 公开（登录前展示） | `{al,ul,isOps,h}`；token 可选、**best-effort** 回填 `ul`（无效/过期一律空，⛔ 不抛） |
| `POST /verify` | 内部（组网关调） | 返回**结果码**，组侧映射错误类；组 `sess` 由组网关 onAuth 懒填 |
| `POST /character/register`·`/query`·`/has` | 内部 | 建角存在性权威（喂 F4 + `ul`） |
| `POST /account/exists` | 内部 | F4「是不是真账号」判据（sId=0） |
| `POST /ban`·`/revoke` | **特权** | 一条 UPDATE 写权威（`status=1` / `token_hash=NULL`）= **下次登不上**；返回 `{banned}`/`{revoked}` = 是否命中（组侧据此决定是否踢在线；`false`=无此账号则不广播） |

**踢在线不在本服务**：封号 SOP 第二步由 **GM 工具**直连各组节点 `POST /admin/kick` 并按 ack 确认送达
（规则 [09·G7b](SERVER.md#12-开发约束63-条规则目录)）。本服务**刻意不持 coord Redis、不广播**——
保证来自 GM 的遍历确认，而非 fire-and-forget 广播（决策见 §5）。

## 4. 待办（上线前必做）

| # | 项 | 现状 | 要做 |
|---|---|---|---|
| **W1** | **端点鉴权分层** | ⛔ **`/ban`·`/revoke`·`/verify`·`/character/*`·`/account/exists` 全部无鉴权**——谁能连到本进程就能封任何人、遍历任意用户足迹 | 按暴露面加共享密钥（范式同 `pay/wxNotify`、`admin/kick`：每请求现读 env + 头比对 + **未配置即拒**）：公开层不动；内部层 + 特权层加密钥（特权层是否独立密钥待定）。⚠ 与之配套：`httpAccount` 调用侧要带上头 |
| **W2** | **split 下封号无审计** | `login_audit` 在账号库；但 `/ban`·`/revoke` 端点**不写审计**，而组侧 `banUser` 的 `auditLogin` 写的是**组库**（落错地方）⇒ split 下账号库里查不到封号记录 | `/ban`·`/revoke` 端点内用 lib `auditLogin` 写（它用本服务自己的池，天然落对库） |
| **W3** | 补画像端点 | 未做 | `bindProfile(uid,{nickname,avatar})` / `bindPhone(uid,encryptedData,iv)`（两段式授权，§2.7；手机号用本服务存的 `session_key` 解密） |
| **W4** | 目录接真实配置 | `lib/area.ts` 是 demo 静态表 | 接配置表/运维后台，按 sId 返回各组实例 `wsUrl` |

## 5. 决策记录（为什么是现在这样）

- **只用 MySQL、不引 Redis**：门户的读写量级小、`verify` 是一条 PK；引 Redis 等于多一套失效/一致性问题。
  ⇒ 连"发一条踢人广播"也不做（本可只加一个 client + 一条 XADD），把送达保证放在 GM 工具的**遍历确认**上——
  因为 fire-and-forget 广播**本来就不构成保证**，两者并存只会让人误以为有保证。
- **登录编排下沉 lib（返回结果码）**：lib 跨包不能 import 组网关的错误类 ⇒ 一律返回 `{ok:false,reason}`，
  由调用侧（组网关 / 本服务端点）映射成错误类或 HTTP 码。这也正是 split HTTP 边界需要的形态。
- **`character` 归本服务**（U5）：`server_id` 列名务实，但对本服务**语义不透明**（不知 sId 含义、不感知区内进度）。
- **单端语义**：`accounts.token_hash` 单列 ⇒ 一账号一有效 token，换端即顶号。多端同时在线需引入
  `sessions` 表（per-device 行）+ `verify` 改按 token 查行，属**数据模型变更**（规则 09·G7c）。
