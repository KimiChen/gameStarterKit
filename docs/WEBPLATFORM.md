# WebPlatform：平台门户服务（账号 plane）

> **本文是 WebPlatform 的设计契约 + 待办账本。** 代码导览见就近 [apps/WebPlatform/README.md](../apps/WebPlatform/README.md)；
> 它在双形态架构中的位置见 [DUAL_MODE §2.7](DUAL_MODE.md)；组网关侧的规则见 [SERVER.md §12](SERVER.md)。

## 1. 定位：门户 = 目录 + 身份权威 + 只读投影

> **本节是账号平面的唯一口径。** [DUAL_MODE §2.1](DUAL_MODE.md) 的「三盲」是 M12 抽象期的初版框架，
> 其中 `zone-blind` 已推翻、`project-blind` ⏸ 当前不做（以后另立项，推导在那里保留），一律以本节为准。

**本游戏专属**（跨游戏中心账号服务**以后另立项**，见 §1.1）+ **zone-aware**（serve 服务器列表、按区存角色展示数据），
但**不拥有权威玩法态、不跑区逻辑**。
⛔ **MySQL-only：无 Redis、无缓存**（`verify` 就是一条 PK SELECT）。组侧的 Redis 快路径/组缓存留在 `apps/server`。

| 承载 | 不承载 |
|---|---|
| `accounts`（openid→uid、status、token 记录、画像列）、`seq`、`login_audit` | 玩法档（Redis `user:{uid}`，组侧真源） |
| `char_registry`（「uid 在哪些区建过角」的存在性权威 + 展示投影） | 每区经济（`user_currency` 等，组库） |
| 登录编排（限流 → code2session → 查/建号 → 签发 token） | 组 `sess:{uid}` 缓存、踢在线（组侧 + GM 工具） |
| 选服目录 `/area/list`（`al`/`wsUrl`/`isOps`/`h` + `ul`） | 控制总线 `stream:kick`（coord Redis 在组侧） |

### 1.1 边界：一游戏一整套栈；中心账号服务**以后另立项**

**当前定案（2026-07-25 用户拍板）**：本服务**只喂本游戏**。「中心账号服务」里的「中心」只指**跨本游戏的
全部物理组集中**（一份身份权威服务 N 个组），⛔ **不指跨游戏**。同理运营 GM/封号后台也是**每游戏一套**。
第二个游戏 = 另起一整套栈，**含另起一个 WebPlatform 实例 + 独立账号库**。

⚠ **别把 `PROJECT_ID` 误读成「线上多游戏共栈」的能力**：[SERVER.md §1](SERVER.md) 的「第二个项目改
`PROJECT_ID` + `PORT`」（Redis 前缀 `<PROJECT_ID>_` + 库名 `game_<PROJECT_ID>`，`WEBPLATFORM_MYSQL_URL`
缺省同此）服务的是**开发机多项目共用同一套 Redis/MySQL 实例**；**线上不会有第二个游戏跑在同一套实例上**。

#### ⏭ 以后要做中心账号服务的前置改造项（**非当前里程碑**，⛔ 不排期、不进 W 编号）

⛔ **当前不要动 schema、不要预先加游戏维度列**——下表是已核实的清单，存档供以后立项时接续
（推导背景见 [DUAL_MODE §2.1](DUAL_MODE.md)）。共性：`accounts`/`char_registry`/`login_audit`/`seq`
四张表**零「游戏/应用」维度**，共用一份门户喂两个小游戏会**静默出错**，每条都是**数据模型变更**、非配置项：

| # | 硬绑定处 | 共用后的后果 | 翻案需要的变更 |
|---|---|---|---|
| P1 | `accounts.uk_unionid`（[schema.sql](../apps/server/sql/schema.sql)） | 微信 unionid 是**同主体跨小游戏的同一个人** ⇒ 两游戏塌缩成同一 `user_id`／同一封号态／同一 `token_hash`（**跨游戏互踢**） | `accounts` 加应用维度；`uk_unionid` 降级为非唯一索引（或改 `UNIQUE(app, unionid)`）；[`lib/login.ts`](../apps/WebPlatform/src/lib/login.ts) 的 1062 恢复相应改按 (app,openid)/(app,unionid) 回读 |
| P2 | `char_registry` PK `(user_id, server_id)` | `sId` 是**全局命名空间**，两游戏区号重叠即互相污染 `ul`／F4 判据 | PK 加应用维度；`character.register/query/has` 全链带应用参数 |
| P3 | token `{uid}.{hex}` + `/verify` | 无「属于哪个游戏」维度 ⇒ A 游戏签发的 token 可建连 B 游戏网关 | token 绑签发方；`accounts.token_hash` 单列 → per-app 行（同 §5「单端语义」那类模型变更） |
| P4 | `wxConfig()`（单份 `WX_APPID`/`WX_SECRET`） | 一进程物理上喂不了两个小游戏的 `code2session` | 凭证表/按应用路由，`code2session` 按应用取凭证 |
| P5 | 封号是**账号级**（`accounts.status`） | 封一个游戏 = **全平台封** | 封号粒度降到「账号×应用」；GM 后台从每游戏一套改为跨游戏共用（同属以后拓展） |

⚠ **`/ban`·`/revoke` 无鉴权不在上表**：它是 **[W1](#4-待办上线前必做)**、**当前就必须做**——它防的是
**外部越权**（谁能连到本进程就能封任何人），与跨不跨游戏无关。中心化只会把同一个洞的爆炸半径从单游戏放大到跨游戏，
⛔ **不构成把 W1 推迟到那时的理由**。

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

### `login_audit.event` 取值（新增事件先进本表，铁律 8）

⚠ 表在**账号库**，但写入方**两侧都有**：WebPlatform lib 写登录类，组侧 `apps/server` 写运营/异常类
（in-process 同库；split 下组侧那几个会落进**组库** ⇒ 见待办 **W2**）。

⚠ **`reason`/`device_id`/`event` 必须在写入前钳到列宽**，且**宽度按各自实际写入的那个库分侧取**（⛔ 不是一刀切）：组侧 `core/auth/session.ts` 写**组库** → `255/64/24`；lib 侧 `lib/auth.ts` 可能写**独立账号库** → `64/64/24`。它有两个不受控来源——`ban`/`revoke` 是**运营输入**、
`login_diverged` 含错误原文；MySQL 在 `STRICT_TRANS_TABLES` 下超长是**抛 `ER_DATA_TOO_LONG`(1406) 而非截断**，
后果是 ① 审计整行写不进（`login_diverged` 恰在它唯一该起作用的场景下失效）② `banUser` 末尾那句 `auditLogin`
无 catch ⇒ **权威已写、人已踢，接口却报失败**，运营会以为没封上。两处 `auditLogin`（组侧 `core/auth/session.ts` 与 lib `lib/auth.ts`）各有一份 `clamp`：⛔ 不切断代理对。

⚠ **为什么分侧而不是一刀切**：lib 侧在 split 连的是**独立账号库**，而那个库**尚无自己的 bootstrap**（见 §4），
很可能仍是加宽前的 `VARCHAR(64)` ⇒ 钳到 255 对它**毫无保护**（65–255 照样 1406）；账号库 migration 被强制
执行之后才可放宽。组侧则相反：它用 `MYSQL_URL` 的**组库**、⛔ 从不写账号库（那正是 **W2** 描述的事），
组库必然跑过 `db-bootstrap`（幂等 `MODIFY reason VARCHAR(255)`）⇒ 列**在任何部署下都是 255**。
⚠ 曾一度把组侧也收到 64，理由抄的是账号库那条——**对组侧是假的**，净效果只有数据损失（运营封号理由被砍、
`login_diverged` 的错误原文只剩前 64 字、去掉固定前缀后仅余约 38 字）。改口径时务必分侧想。

⚠ **`device_id` 尤其要钳**：它来自**客户端输入**，而 Fastify 的 `Body` 泛型仅编译期、本服务登录端点
（`ApiPath.WxLogin`/`DevLogin`）原先直接透传。未钳时后果比 `reason` 更糟——`loginByOpenid` 里 token
**已经签发轮换**才走到 `auditLogin`，抛 1406 ⇒ **客户端收 500 拿不到新 token、审计也没有**，是一条比
`login_diverged` 更彻底的登录分叉。现两端点已就地校验（与 in-process 的 zod `string().max(64)` 同契约，
超长 400 `INVALID_PAYLOAD`），钳制作为第二道。

| event | 写入方 | 含义 |
|---|---|---|
| `wx_login` / `dev_login` | lib `loginByOpenid` | 登录成功（`auditKind` 由入口传入） |
| `fail` | lib | 登录被拒；`reason` = `banned` / `code2session:<码>` |
| `ban` / `revoke` | 组侧 `core/auth/ban.ts` | 运营动作（`reason` 为操作理由） |
| `login_diverged` | 组侧 `platform/inProcessLogin.ts` | ⚠ **仅 in-process**：抢锁失败/写缓存失败，`accounts.token_hash` 已换发成一个**没人持有**的 token、组 `sess` 仍是旧 hash ⇒ 同一 uid 会同时有一行登录成功 + 一行本事件。客户端重登即自愈；出现即说明该号撞上了 freeze/thaw 长持锁（HANDOFF §8.5/§8.6） |

**踢在线不在本服务**：封号 SOP 第二步由 **GM 工具**直连各组节点 `POST /admin/kick` 并按 ack 确认送达
（规则 [09·G7b](SERVER.md#12-开发约束63-条规则目录)；运营侧实现规格见 [GM-TOOL-SPEC.md](GM-TOOL-SPEC.md)）。本服务**刻意不持 coord Redis、不广播**——
保证来自 GM 的遍历确认，而非 fire-and-forget 广播（决策见 §5）。

## 4. 待办（上线前必做）

| # | 项 | 现状 | 要做 |
|---|---|---|---|
| **W1** | **端点鉴权分层** | ⛔ **`/ban`·`/revoke`·`/verify`·`/character/*`·`/account/exists` 全部无鉴权**——谁能连到本进程就能封任何人、遍历任意用户足迹 | 按暴露面加共享密钥（范式同 `pay/wxNotify`、`admin/kick`：每请求现读 env + 头比对 + **未配置即拒**）：公开层不动；内部层 + 特权层加密钥（特权层是否独立密钥待定）。⚠ 与之配套：`httpAccount` 调用侧要带上头 |
| **W2** | **split 下封号无审计** | `login_audit` 在账号库；但 `/ban`·`/revoke` 端点**不写审计**，而组侧 `banUser` 的 `auditLogin` 写的是**组库**（落错地方）⇒ split 下账号库里查不到封号记录 | `/ban`·`/revoke` 端点内用 lib `auditLogin` 写（它用本服务自己的池，天然落对库） |
| **W3** | 补画像端点 | 未做 | `bindProfile(uid,{nickname,avatar})` / `bindPhone(uid,encryptedData,iv)`（两段式授权，§2.7；手机号用本服务存的 `session_key` 解密） |
| **W4** | 目录接真实配置 | `lib/area.ts` 是 demo 静态表 | 接配置表/运维后台，按 sId 返回各组实例 `wsUrl` |

⏭ **本表之外另有 P1–P5**：以后做**中心账号服务**（一实例喂多游戏）的前置改造项，见 [§1.1](#11-边界一游戏一整套栈中心账号服务以后另立项)。
它们**非当前里程碑、不排期、刻意不占 W 编号**——当前定案是本游戏专属，⛔ 别把它们当成上线前必做。
⚠ 反过来也别把 **W1 归到那边**：W1 防的是外部越权，与跨不跨游戏无关，**当前就必须做**。

## 5. 决策记录（为什么是现在这样）

- **只用 MySQL、不引 Redis**：门户的读写量级小、`verify` 是一条 PK；引 Redis 等于多一套失效/一致性问题。
  ⇒ 连"发一条踢人广播"也不做（本可只加一个 client + 一条 XADD），把送达保证放在 GM 工具的**遍历确认**上——
  因为 fire-and-forget 广播**本来就不构成保证**，两者并存只会让人误以为有保证。
- **登录编排下沉 lib（返回结果码）**：lib 跨包不能 import 组网关的错误类 ⇒ 一律返回 `{ok:false,reason}`，
  由调用侧（组网关 / 本服务端点）映射成错误类或 HTTP 码。这也正是 split HTTP 边界需要的形态。
- **`character` 归本服务**（U5）：`server_id` 列名务实，但对本服务**语义不透明**（不知 sId 含义、不感知区内进度）。
- **单端语义**：`accounts.token_hash` 单列 ⇒ 一账号一有效 token，换端即顶号。多端同时在线需引入
  `sessions` 表（per-device 行）+ `verify` 改按 token 查行，属**数据模型变更**（规则 09·G7c）。
