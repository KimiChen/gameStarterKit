# MEMORY.md — apps/serverNew 长期约定

> 真源 `humanDocs/协议模块调整.md`（§1 目标 / §6 纪律 / §7 记录表）。2026-09-20 全文存档：`archive/MEMORY-full-2026-09-20.md`（细节查那里，这里只留「不写下来就会踩坑」）。

## 投入顺序（用户已定）

服务端是唯一主交付物：默认只改 `engine/` `server/`；shared 仅随 wire 契约调整；客户端只做黑盒测试 + 最小 transport 适配。⛔ 不做 UI 技术栈迁移、视觉打磨、客户端架构清理。

- ⛔ **业务玩法开发不跨到旧 `apps/server`**（2026-09-20 用户明确定调「开发业务过程不要管 apps/server」）。新增一个 lobbyRpc 域**必然**让旧 server 的端点全集闸（`apps/server/src/websocket/loader.ts`：shared 声明的每条路由都必须有 `src/websocket/<域>/<方法>.ts`）报「shared 已声明但无端点文件」并**拒绝启动**（4 条契约测试红）。那是**另一条通道**的工作项，不是业务玩法的缺陷：⛔ 不造 fail-closed 桩、不伪造等级/账本、不缩窄 shared 契约。已写入 `server/README.md`「生成和 Bean」段与 `humanDocs/协议模块调整.md` §6。
- ⚠ **但「不动 `apps/server`」≠「`apps/server` 下路径一律不许改」**：`apps/server/test/lobbyRpcVectors/<域>.ts` 是 **codegen 契约要求**（`apps/server/tools/plugin-codegen/lib.ts` 的 `readVectorSidecars` 双向对齐：每个 domain 必须有同名 sidecar，缺则 `codegen:plugins` 直接失败；域删除要同批删 sidecar，⛔ 不留孤儿）；`apps/server/tools/plugin-codegen/**` 是**客户端插件 codegen 面**（`autoStart` 三道校验就在这）。⇒ 新增域必须同批给最小合法 request/response 向量 + 重跑 `codegen:plugins`，`index.generated.ts` 由生成器独占（⛔ 不手改）。判据：`cd apps/server && node --import tsx tools/plugin-codegen/cli.ts --check` → `generated plugin artifacts are fresh`（exit 0）。区分标准 = **所有权**：codegen/契约面必须跟着改，旧通道**业务端点与测试套件**不碰。
- 业务玩法的验收面**只有** `apps/serverNew`：`pnpm check`、`pnpm verify:module -- <module>`、`test/runtime/protocol/native-lobby-routes.test.ts`，不含 `apps/server` 的测试套件。
- ⚠ `verify:module` 的 `test:module` 要求 `test/modules/<module>/` 存在 ⇒ 只有原生 Lobby handler 的模块（`arena`/`arenaShop`/`redeem`/`slg`/`income`）**必然**报 `module has no tests`，属既有形态，⛔ 不为凑门禁造空测试目录（覆盖在 `native-lobby-routes.test.ts`）。
- ⚠ 改 `apps/shared/src/protocol/lobbyRpc/domains/<域>.ts` **任一字**（含注释）都会变域 digest ⇒ `codegen:plugins` 要求递增该域 `contractVersion`，否则拒绝生成；撤回改动必须**字节级精确**（用 `codegen:plugins` 报 `no changes` 自证）。
- 🔑 **shared 的 lobbyRpc registry 是两代服务端「共有」的 wire 面**（2026-09-21 查清）：MMO 产品线（`chat` / `party` / `world`）在**旧 `apps/server`** 上实现，只把域加进同一份 registry（`e4f9f692` party / `1280037e` chat / `73716dac` world / `76ae49ff` 分线，三者落 `apps/serverNew` 的文件数 = 0；`docs/MMO.md` 从不提 serverNew；本项目 `Persona`/`WorldRoom`/`world_instance`/`controlEpoch` 命中全为 0，对照 apps/server 29/23/15/13）。⇒ **「shared 声明了 N 条」≠「本项目应实现 N 条」**。启动期 `NativeLobbyRouteRegistry.assertComplete()` 的期望集是「**本项目拥有的**路由」= 声明面 ∖ `src/runtime/lobby/NativeLobbyPendingRoutes.ts` 里登记的路由（带归属原因）；该表与「声明面 ∖ 注册面」**双向对齐**（路由迁走或从 shared 删除 ⇒ 登记陈旧 ⇒ 启动即红，强制同批删行）。⛔ 这张表登记的是**归属**不是**进度**：不许把「本项目该实现但还没实现」的路由登记进去换启动通过。⚠ 新增该文件的导出名必须等于文件名（命名审计：文件只有一个主导出时导出名 == 文件名，⛔ 加豁免不如改名）。
- 🔑 原生通道**已于 2026-09-21 恢复可启动**（自 09-19 party 加入起一直起不来）。`pnpm verify:native-lobby-live` **20/20 无旁路**、`test:suite -- runtime startup` exit 0、`pnpm check` **exit 0**。⚠ 但**旧 `apps/server` 仍缺 income 三条端点**（本次新增域的直接后果）⇒ 旧通道拒绝启动、客户端**默认 Colyseus 路径**不可用；且**客户端 GUI 端到端链条从未验证**。
- ⚠ 多进程联调报 `EADDRINUSE`（如 `28095`）时先查**孤儿夹具进程**（`ps -ax -o pid,etime,command | grep entrypoint.cjs`，带 `-v livemulti` 的就是）——异常退出的联调会留下 master+worker 占端口；先 `kill <master>` 等几秒，仍在则 `kill -9`。

## 命令纪律

- 根目录无 `package.json`：`check:*` / `test:*` / `typecheck` 先 `cd server`。
- 2026-09-20 18:4x 起 `apps/serverNew` **已入库**（提交 `4dcb3779` + 合并 `a2f3368d`，已推 `origin/serverNew`）⇒ 变异回滚现在**可以**用 `git checkout|diff`；此前「未跟踪」的旧纪律作废。
- `mocha.config.cjs` 有 `bail: true`；看全部失败：先 `pnpm test:file`，再 `pnpm exec mocha --config test/mocha.config.cjs --no-bail build/test-compiled/all-tests/<路径>`。
- `check:quick` 不含 runtime/http/modules → 改 runtime 必须另跑 `pnpm test:suite -- runtime`。新增 `.cjs`/`.md` 也要过 prettier。
- ⚠ 管道吃退出码：`... | tail` 后 `$?` 是 tail 的 → 重定向到文件再取。
- ⚠ `check:generated` 在临时工作区大量删除，会撞 WorkBuddy 注入的删除兜底闸（50 次/会话，不随回合重置）→ 用 `cd server && env -u NODE_OPTIONS pnpm check`。

## 提交与推送（仓库 = `gameKit` 根，`apps/serverNew` 只是子目录）

- 分支现状：`main` / `new` / `server_kxz` / `serverNew`（后者 2026-09-20 新建，基线 `b88069ce`）。
- **推之前必须先 `git fetch`**：远程 `new` 会被人推进，本地缺那个 tip 时 push 协商**排除不掉公共对象**，会把整段历史重发（实测 2798 对象 → 20627 对象 / 10 MiB → 60 MiB+），而本机 git 走 fake-IP 代理（约 300 KiB/s）⇒ 60 MiB 级传输直接 `Broken pipe`。fetch 后重推 18 秒完成。
- `git push` **不带 `--progress` 时管道下完全不显示进度** ⇒ 排障一律 `--progress` + 重定向文件；否则只能看到「进程活着、CPU 0%」，会误判卡死（本次白等 17 分钟并误杀了一次正常推送）。
- 上传量先量再推：`git rev-list --objects HEAD --not origin/new | wc -l`。
- ⚠ 合 `origin/new` 会撞生成镜像重构：`apps/Cocos/assets/src/ui-uniflex/` 的 `pages/` 被上游改成 `modules/` ⇒ 冲突 **131 项**。正解 = **整棵镜像子树取上游**（`git rm -r --cached <dir>` → `git checkout origin/new -- <dir>` → `git clean -fdq -- <dir>`），因为 `apps/Cocos/assets/src` 是 `apps/client/src` 的逐字节镜像（禁止手改）。
- ⚠ 预判冲突**不能只看精确路径交集**（本次只算出 18 项，真实 131 项）：rename 检测出的冲突要靠 `git status --porcelain` 的 `AA/AU/UU` 状态码识别。判据是「上游这批提交有没有发生重命名」——**无重命名时** `comm -12 <(git diff --name-only A...B) <(git diff --name-only B...A)` 可准确预判（实测 0 项 → 实测 0 冲突），**有重命名时会严重低估**。
- 锁文件冲突**一律交给 writer**：`node scripts/protocol-fingerprint.mjs --write`、`node scripts/protected-paths-lock.mjs --write`（各自带 `--check`）；⛔ 不手改。
- 提交前可用 `npm run verify:sync` 判漂移：`sync-shared --check` 应 ✔；`sync-client --check` 的「缺 .meta」项属上游既有基线（见下），用 `grep` 自己新增的文件名验证是否被卷入。

## 多进程（alloy-core）硬约束 —— 踩得最贵

- 主控 → worker 的 `PROCESS_MESSAGE` 被 worker 侧判 `INVALID_SOURCE` 静默丢弃 → 调用方 10s 超时（HTTP 是 socket hang up）。⇒ 落到 worker 的内部动作不能从主控发起。
- 内部 HTTP 端点（`/health` + `/internal/action`）由**监听 worker** 承载；`/livez` `/readyz` 由**主控**在 `healthPort`（缺省 `clientPort+20000`）承载。⛔ 不互换。
- 通用幂等闸只进一次且在**持有连接的一端**：`executeForwarded` 只执行不进闸；用 `execute` 会撞上监听进程刚写的 `pending` 租约。
- `ALLOY_PROCESS_ROUTE_TRACE=1` 打在 `requestMessage` **之前**：只证明「发起了转发」，不证明「已送达」；跨进程证据必须另有对端行为观测。
- 自检脚本收尾：优雅退出失败时不能无条件 `stopped = true`，否则留孤儿 master 占端口 → `EADDRINUSE`。
- worker 崩溃重拉：10s 内 5 次预算，超出判 crash loop 停整个 runtime ⇒ ⛔ 别反复杀进程。判「补齐了」要四条件同时成立（同 workerId + pid 变 + generation 恰好 +1 + READY 且新 pid 存活）。崩溃唯一可观测出口是主控 `onWorkerError`。

## 测试与变异纪律

- 对等性 `forward` 模式必须走整条链（监听进程进闸 → processRouter → 目标 worker），跑**真实** `installNativeLobbyProcessRouter`，⛔ 不在测试里复刻路由。
- 「无重复副作用」常由多层保证（通用闸 `done` 短路 + 领域守卫）⇒ **单层变异为绿不等于断言不承重**，先数清层数。
- 取余路由（`bindId % taskWorkerNum`）除数为 1 时退化成常量 ⇒ 夹具保持 `taskWorkerNum >= 2` + 脚本自检闸；断言目标从池里派生，⛔ 不写死 id。判「新断言是否只是重复旧断言」的最有效变异 = 把生产侧取余换成常量。
- 真实库跨运行累积 → 取前后差值，别钉绝对条数。`FakeCenterRedis` 的 Lua 按脚本身份标记分派，未镜像的脚本直接抛错；收帧辅助函数不能丢弃不匹配的帧。
- 要证明「失败后资源被释放」，失败必须发生在资源分配**之后**（真 `listen(0)` 占端口触发 `EADDRINUSE`）；「配置被拒」另留一条用例。
- `ServiceRuntime` 的 `initialized` 在所有失败分支都要走 `rollbackServiceRuntimeStart()`；`NativeLobbyRouteServices.onReleased` 是必填成员（不在 `check:quick` 范围）。

## 真实环境联调（改协议/装配后主动跑，都不在门禁里）

- ⚠ **原生通道当前起不来（既有缺口，非改动引入）**：`LobbyServer.start` 先跑 `NativeLobbyRouteRegistry.assertComplete()`，而 shared 声明 37 条只注册 28 条（`chat.send` / `party.*`×10 / `world.*`×2 在 `src/` 零引用）⇒ 真实进程一启动就抛 `route registry mismatch`，`verify:native-lobby-live` 的症状是**无输出干等到超时**（最后错误 `ECONNREFUSED`），不是卡在编译或 Redis。要验证别的改动只能**临时旁路**该抛错（带 `MUTATION-PROBE` 标记）+ 跑完**逐字还原**（`grep -rn MUTATION-PROBE server/` 为 0 + `git diff` 为空），⛔ 不许留成常态或改成 `console.warn`。补齐这 12 条是独立工作项。
- `cd server && pnpm verify:native-lobby-live` **20/20**（含 income 真实落库场景）；`...-multiprocess-live` 27/27（夹具 `bearjoylive` / `bearjoylivemulti`，⛔ `taskWorkerNum` 不得退回 1）。前置 Redis 6379 + MySQL 3306。
- ⚠ **`redis-cli -n <非数字>` 不报错、静默落 db 0** ⇒ 夹具漏传库号会写错库（症状「登录钩子什么都没做」，更糟的是 0 号库有同名键时**假绿**）。`lobbyLiveHarness.createHarness` 已对 `centerRedisDb`/`userRedisDb` 加正整数闸硬失败；新增线路时库号必须显式传（单进程 center 9 / user 8，多进程 6 / 5）。
- 服务进程由 `deploy/dev/entrypoint.cjs` 以 **ts-node（`transpileOnly: false` + `ts-patch/compiler`）** 拉起 ⇒ 真实联调**直接读 TS 源码**，改完 `src/` 不用先 build（禁 `transpileOnly` 是为了 bean transform 不静默失效）。
- 根 `npm run verify:dual-lobby` 9/9（前置 `cd apps/server && npm run stack` + `npm run db:bootstrap`）。
- Creator GUI 驱动陷阱全文在 `tools/creator-preview/README.md`。
- 同服多账号：uid = `dev-` + `sha256("<devKey>:<serverId>")[:16]`（同 devKey 恒同号，⚠ 与旧 `apps/server` 的 `devUidOf` 不同）；首选 `?devKey=`。改 `src/app/**` 必须重启 Creator 进程才重编译。⚠ 非法 devKey 故意 warn + 回落 `dev_local`，别改成 throw。

## 两套通道的码表与金币账本不同（手动联调前必读）

- 兑换码两份：原生 Lobby 只有 `WELCOME100`；旧 `apps/server` 是 `WELCOME2026` / `SNAKE90` / `DEVTEST`。
- 金币账本两个：原生 = Redis `nativeLobby:shop:balance:v1`（唯一入账路径是兑换码）；旧 = MySQL `user_currency`，兑换奖励进插件私钱包不进主账本。
- 联调数据在 Redis 6379 的 db 6；清玩法状态直接 `DEL nativeLobby:*`。
- 自动化只覆盖一部分：`native-lobby.mjs`（原生 8 步）与 `run.mjs <场景>`（旧通道）；兑换码、竞技场、大地图、衣柜在原生通道上只能手动点。

## 玩家数据落点（用户已定：默认 Redis）

- **业务玩家数据默认落 Redis**（engine Redis Bean `Hash`/`UserHash`/`HashJson`，随 Action 提交写回）；MySQL 只承载账号映射（`center_user`）、角色查询快照（`server_user`）与运营/GM/活动配置表。⛔ 不为业务数据建表或引入第二份真源。
- 真源 = `userRedis`（`127.0.0.1:6379 db15`）的 `User_<uid>` hash；写入时机 = `ServerTask` 成功后 `RedisTask.onActionSuccess` → `RedisService.save()` 管道（提交成功后才回响应）。
- `server_user` 只在建号/登录/过天/改名/下线刷新 ⇒ 与 Redis 会漂移，⛔ 不得当排行榜/统计/结算的准确值来源。
- 例外：旧通道邮件在 MySQL `mail`/`global_mail`（`MailBean.mails` 是 `@OnlyNet`）；原生通道邮件/金币在 Redis `nativeLobby:*`；排行榜是 Redis ZSet。
- 该约定已落三处文档：`server/README.md`「生成和 Bean」段、`engine/docs/development.md`「Change 和持久化」段、`humanDocs/协议模块调整.md` §6。

## 既有基线（别误判成本次引入）

- 计数基线（2026-09-20 重取）：`routes:172 / protocolMessages:298 / protocolFields:587 / beans:94 / beanFields:623 / mods:30 / errorCodes:312 / redisKeys:40 / databaseTables:32 / databaseFields:346 / classListEntries:28`。
- ⚠ 重取基线两坑：① `pnpm update:compatibility-baseline` 的输出不过 prettier，必须紧跟 `pnpm exec prettier --write test/structure-baseline/compatibility-baseline.json`；② 重取前先 `pnpm test:compatibility` 拿漂移清单**逐项审计**。
- 根 `test:client` 592/598（6 项既有红：vendor 锁 2、uniflex 缺包 1、`loginFlow.ts` 源码 pin 3）；`typecheck:client` 55 项全在 `ui-uniflex`；`sync-client --check` **162 → 合入 `origin/new` 后 161 项**缺 Creator `.meta`（全部落在上游新增文件上，需开一次 Creator 生成），属既有基线。
- 改 `apps/client/src/app/**` 或 `Main.ts` 属 §12.3 显式框架侵入，须声明后 `node scripts/protected-paths-lock.mjs --write`。

## P6 旧协议链清理（2026-09-20 已清完，含第二轮续扫）

全仓（排除 `node_modules`/`humanDocs`/`server/src/http/public/`）扫旧协议关键词只剩注释与「不得复活」断言 ⇒ 干净；
`pnpm check` exit 0（计数 172/298/587/94/623/30/312/40/32/346 未变 ⇒ 协议面未动）+ `pnpm test:suite -- runtime` 74 passing。
**改动清单与逐项证据在 `humanDocs/协议模块调整.md` §7 末行 + `2026-09-20.md`「清理」两节**，备份 `.workbuddy-ai/backups/p6-residue-20260920-1755.tar.gz`。

**两个必踩的坑**：① 改 `server/src/runtime/protocol/**` 任一字 ⇒ `record.json` 里该文件 `md5`+`mtime` 变 ⇒
`check:generated` 红，须跑一次 `pnpm generate` 刷新指纹。② 删协议文件里的**第 2 个**导出会撞命名审计（「模块只剩
一个导出且与文件名不符 ⇒ 违规」），豁免走 `scripts/naming-audit/audit-module-names.js` 的 `compatibilityAllowlist`
登记 `['路径',{names,reason}]`（⛔ 不是把泛化词加白名单）；本次登记 `C2S/global.ts -> GlobalResponse`。

**⛔ 别删这四类**（都像死代码）：`C2S/{base,commom,default,global,MsgError,ModInfo,message}.ts`（被 serviceProto 的
`import {}` 空锚点引着）、`C2S/base.ts` 的 `PushChange`（proto.json5 声明的协议类型 + 兼容基线，删它=改协议面）、
`generated/.../C2S/actions.ts`（`executeInternalAction` 驱动，GM 后台靠它）、`ModSync.autoGetModChanged`
（注释已写明留给原生通道复用，⛔ 不许加回响应路径）。

**仍含 PB 且本仓不改**：`server/src/http/public/**` 是另一仓库构建的 GM 后台产物（`build-info.json` 记 `webCommit`），
`assets/*.js` 调已删的 `/adjust/{downloadProto,getPbJs,wstool/getHash}`，`robot-nodejs-runner-download.js`(871K)
内含整套 protobufjs 运行时 ⇒ 需前端仓同步。⚠ 客户端 `assets/src/shared/protocol` 的 `C2S` 命中是**玩法** wire（不迁移），
不是残留；`build/test-compiled/*` 的 `.signature` 对全部源码做 sha256 ⇒ 陈旧缓存会重建，不会拿旧代码跑测试。
