# MEMORY.md — apps/serverNew 长期约定

> 真源是 `humanDocs/协议模块调整.md`（§1 目标 / §6 纪律 / §7 记录表）。此处只留「不写下来就会踩坑」的条目。

## 投入顺序（用户已定）

- **服务端是唯一主交付物**：默认只改 `engine/` / `server/`；shared 仅随服务端 wire 契约调整；客户端只做黑盒测试与最小 transport 适配。顺序：服务端代码 → 契约/持久化/真实进程 → 最小客户端 transport → Creator GUI（仅当不可替代）。⛔ 不做 UniFlex/FairyGUI/手写 Cocos 迁移、视觉打磨、UI 资源、客户端架构清理。

## 命令纪律

- 根目录**无** `package.json`：`check:*`/`test:suite`/`test:file`/`typecheck` 都要先 `cd server`。
- `apps/serverNew` **未被 git 跟踪** → 变异/回滚不能用 `git checkout|diff` 作证据。手法：改前加 `MUTATION-PROBE` 标记，还原用 Edit 逐字改回 + `grep -c` 核对锚点原文与标记为 0。
- `test/mocha.config.cjs` 有 `bail: true`。看全部失败：先 `pnpm test:file`（负责编译），再 `pnpm exec mocha --config test/mocha.config.cjs --no-bail build/test-compiled/all-tests/<路径>`。
- `check:quick` **不含 runtime/http/modules** → 改 runtime 代码必须另跑 `pnpm test:suite -- runtime`。
- 新增 `.cjs`/`.md` 也要过 prettier（`format:check` 扫 `server/**`），否则 `pnpm check` 红。
- 兼容基线重取走 `pnpm update:compatibility-baseline`；按 §6 纪律重取前须**逐项审计**，不得为过闸而放宽。

## 多进程（alloy-core）硬约束 —— 踩得最贵

- **主控发不出到 worker 的进程请求**：主控 `MasterRuntimeServerFacade.requestMessage` 发出的 `PROCESS_MESSAGE` 被 worker 侧 `WorkerProcessMessenger.#requireTrustedSource` 判 `INVALID_SOURCE` 静默丢弃（只接受源角色为 worker 的信封，主控 `workerId === null`）→ 调用方等 10s 超时（HTTP 上是 `socket hang up`）。worker→worker、worker→master 正常。⇒ 落到 worker 的内部动作都不能从主控发起。
- 内部 HTTP 端点（`/health` + `/internal/action`）由**监听 worker** 承载；多进程独立探针 `/livez` `/readyz` 由**主控**在 `healthPort`（缺省 `clientPort + 20000`）承载，只读、⛔ 不得加内部动作。⛔ 两者不要互换位置。
- **通用幂等闸只进一次，且在持有连接的一端**：`NativeLobbyRouteRegistry.executeForwarded` 是目标进程入口（只执行、不进闸）。用 `execute` 会撞上监听进程刚写的 `pending` 租约（键在中心 Redis 上跨进程共享），正常 `guild.join` 被判 `IN_PROGRESS` 且副作用一次都不发生。判据是「本进程是否持有连接」。
- `ALLOY_PROCESS_ROUTE_TRACE=1` 的痕迹打在 `requestMessage` **之前**：只证明「发起了转发」，不证明「已送达」；当跨进程证据必须同时有对端行为观测（曾因此让一条踢人场景假绿）。跨进程对象路由只在 `binding.bindId !== undefined` 时发生；监听进程 handler 先跑，但 `processRouter` 返回 true 就 `return`（不落分组、不执行 `doAction`）。
- 自检脚本收尾：优雅退出失败时**不能**无条件 `stopped = true`，否则 `finally` 以为无需收尾，留下孤儿 master 占端口 → 下次 `EADDRINUSE`。要 `stopped = graceful` 并补 SIGKILL。
- **worker 崩溃重拉**：alloy-core 自动重拉同一槽位（`generation` 只在 `WorkerRegistry.beginSpawn` 重 fork 时 +1），走**同一套** `onWorkerStart` → `initializeWorker`（含重新获取调度器所有权）。重启预算 10s 内 **5 次**，超出判 crash loop 并 `requestStop` 停掉整个 runtime ⇒ ⛔ 不要反复杀进程。判「补齐了」要**四条件同时成立**（同 workerId + pid 变 + generation 恰好 +1 + READY/RUNNING 且新 pid 存活）：只比 pid 会把「槽位标 FAILED、pid 置空」算进去；只比 generation 会被「spawn 到一半失败」蒙混（`beginSpawn` 在 fork **之前**就 +1）。
- **崩溃的可观测出口只有主控的 `onWorkerError`**：worker 自己的 `onWorkerExit` 只在优雅 drain 时才跑（硬杀轮不到），alloy-core 内部的 `context.log` **不落**服务进程 stdout。删掉它 ⇒ 「崩了又被重拉」在日志里完全无声。

## 测试与变异纪律

- 对等性测试的 `forward` 模式必须走**整条链**（监听进程进闸 → `processRouter` → 目标 worker 用自己的装配执行）；只驱动目标 worker 那一跳看不到幂等闸。跨进程测试要跑**真实**的 `installNativeLobbyProcessRouter`，⛔ 不在测试里复刻路由逻辑；对等断言必须同时证明「转发真的发生过」（记录 `forwards`）。
- 「无重复副作用」常由**多层**共同保证（通用闸 `done` 短路 + 领域守卫）。实测 `guild.join`：撤掉通用闸 → 协议场景**全绿**（领域守卫吸收了重放），只有「跨进程转发次数必须恰好 `[2,4]`」这条红。**单层变异为绿不等于断言不承重**，先数清防御层数。
- **取余/取模类路由（`bindId % taskWorkerNum`）在除数为 1 时退化成常量** ⇒ 「单元素夹具」写的分布断言会退化成恒真。两道防线：① 夹具保持 `taskWorkerNum >= 2` + 脚本里 `TASK_WORKER_NUM >= 2` 自检闸（夹具与常量必须一起改，不一致时闸**最先**触发）；② 断言目标**从池里派生**，⛔ 不写死 id。
  **判「新断言是否只是重复旧断言」的最有效变异**：把生产侧取余换成常量。实测改成 `worker_num` 后旧断言**全绿**（bindId 2/4 本来就该落 worker 1），只有新分布场景红 —— 旧断言分辨不出「取余路由」与「永远发给同一个 worker」。
- 真实库**跨运行累积**（公会成员、`IdGenerater:user:N`）→ 取前后差值，别钉绝对条数；`guild.broadcast` 推给**所有**成员，累积会让「每次 join 推几条」不稳定。
- `FakeCenterRedis` 的 Lua 按**脚本身份标记**分派，未镜像的脚本直接抛错；假体方法与真实命令同形（`LIMIT` 下推存储层，⛔ 不做「取全量再切片」）。收帧辅助函数不能丢弃不匹配的帧（推送可能先于回包）。
- 要证明「失败后已分配资源被释放」，失败必须发生在资源分配**之后**：用真 `net.createServer().listen(0)` 占住空闲端口触发 `EADDRINUSE`；「配置被拒」另留一条用例。
- `ServiceRuntime` 的 `initialized` 在所有失败分支都必须走 `rollbackServiceRuntimeStart()`（清 `nativeLobby`/`forwardedLobbyRoutes`、`nativeLobbyProcessRoutes.reset()`），否则残留的 `true` 会让重试被 `already initialized` 挡住、真因被掩盖。`NativeLobbyRouteServices.onReleased` 是必填成员，改路由装配的假体要补上（它不在 `check:quick` 范围，挡不住门禁）。

## 真实环境联调入口（改协议/装配后主动跑，**都不在门禁里**）

- `cd server && pnpm verify:native-lobby-live`（单进程）→ **19/19**；夹具 `bearjoylive/platform.json5`。
- `cd server && pnpm verify:native-lobby-multiprocess-live`（**真实多进程**）→ **27/27**：同一份 19 条场景集 + 8 条专有场景（含 **worker 崩溃重拉**、**`bindId % taskWorkerNum` 分布**）。夹具 `bearjoylivemulti/platform.json5`：库 6/5/4、`workerNum=1` + `taskWorkerNum=2` + `userTaskWorkerNum=2`（覆盖全部四种角色）。跨进程硬证据 = `/health` 的 `workerId→pid` × `lsof` 端口归属 × 行为观测。前置：Redis 6379 + MySQL 3306。⛔ 夹具 `taskWorkerNum` **不得退回 1**（取余恒为 0，分布断言变空转）。
- 根 `npm run verify:dual-lobby` → **9/9**（前置 `cd apps/server && npm run stack` + `npm run db:bootstrap`）。
- Creator GUI 驱动陷阱全文在 `tools/creator-preview/README.md`（单按钮模态必须点按钮本身；面板重开保留 ScrollView offset；Creator 不因 touch 重编译，须 kill 后重开并在 chunk 里 grep 改动标记）。
- **同服多账号（换号）**：uid 由 `webplatform-local.cjs` 的 `devUserId` = `dev-` + `sha256("<devKey>:<serverId>")[:16]` 派生 ⇒ 同 devKey 恒同号（⚠ 与旧 `apps/server` 的 `devUidOf` 不是同一套）。**首选 `?devKey=`**（`loginFlow.ts` 的 `devLoginKeyFromQuery()`；`src/app/**` 属 §12.3 保护路径，改完**必须重启 Creator 进程**才重编译）。⚠ 非法值**故意** warn + 回落 `dev_local` 而非 fail-fast：调用点的异步 IIFE 会吞掉拒绝，抛错表现为「点进入游戏毫无反应」——别当疏漏改成 throw。退路 `/tmp/serverNew-stack/devkey-proxy.mjs`。⛔ 别改副本 `devUserId` 的盐。

## 两套通道的码表与金币账本**不同**（手动联调前必读）

- **兑换码表是两份**：原生 Lobby（serverNew）只有 `WELCOME100`；旧 `apps/server` 是 `WELCOME2026` / `SNAKE90` / `DEVTEST`。用错码只会得到「兑换码不存在」，易误判成功能坏了。客户端输入 `trim` + 转大写，格式 `^[A-Z0-9]{4,32}$`。
- **金币账本也是两个**：原生通道是 Redis `nativeLobby:shop:balance:v1`（center 库），**唯一入账路径是兑换码**；旧通道是 MySQL `user_currency`（currency=1），dev 下只能 SQL 种 + 清 `*cache:currency*`，且兑换奖励进插件私钱包 `pl:redeem:wallet:{uid}` **不进主账本** ⇒ 「兑换码给竞技场商店充值」只在原生通道成立。
- 联调数据都在 **Redis 6379 的 db 6**；`nativeLobby:*` 状态键：`shop:balance` / `shop:operations` / `arena:tiles` / `arena:trophies` / `slg:tiles` / `snakeCosmetic:profiles` / `redeem:claims` / `user:profile`（字段 `"<sId>:<uid>"`）。清玩法状态直接 `DEL`。
- `snakeCosmetic` 的 store **每次调用都读 Redis**（只有 version 计数在内存），种完碎片**不用重启服务**。可合成皮肤只有 4 个：133(300)/401(10)/403(120)/411(300)。
- 自动化驱动只覆盖一部分：`native-lobby.mjs`（原生通道 8 步）与 `run.mjs <场景>`（**旧通道**）。**兑换码、竞技场、大地图、衣柜在原生通道上目前只能手动点。**

## 既有基线（别误判成本次引入）

- 计数基线：`routes:172 / protocolMessages:298 / protocolFields:587 / beans:94 / beanFields:623 / mods:30 / errorCodes:312 / redisKeys:40 / databaseTables:32 / databaseFields:346 / classListEntries:28`（2026-09-20 17:0x 重取并 prettier 格式化）。此前 `classListEntries` 基线停在 **27** 而实际已是 **28**（09-20 新增 GM 动作 `ActionPlayerKickOnline`）⇒ `pnpm check` 红在 `test:suite -- startup structure`。**已重取并审计**：深度 diff 只多出 `classLists['gm-info.ts'] + ActionPlayerKickOnline` 一条。`pnpm test:compatibility` → `matched`；`format:check` → 全匹配；`lint:baseline` → 0 错/0 新增；engine-contracts 9/9。最终 `pnpm check` **exit 0**。
- ⚠ **重取基线的两个坑**：① `pnpm update:compatibility-baseline`（= `capture-compatibility-baseline.js --update`）写出的 JSON **不过 prettier**，必须紧跟 `pnpm exec prettier --write test/structure-baseline/compatibility-baseline.json`，否则 `pnpm check` 会红在 `format:check`（实测重取后 23543 行 → 格式化后 22643 行，语义逐字节等价）。② 重取前必须先 `pnpm test:compatibility` 拿到漂移清单并**逐项审计**，因为它无选择性、会吸收同批所有漂移。
- 关闭期 `DisconnectsClientError` 未处理拒绝与 P6 前备份逐字节一致 → 既有行为，别顺手改引擎关闭顺序。
- 根 `test:client` 598 项 **592 passing / 6 失败**（vendor 内容锁 2、uniflex 缺包 1、`loginFlow.ts` 源码 pin 3）；`typecheck:client` 55 项全在 `ui-uniflex`；`sync-client --check` 62 项缺 Creator `.meta`。
- ⚠ 管道吃退出码：`npm run xxx | tail` 后 `$?` 是 `tail` 的 → 复核要重定向到文件再取 `$?`。
- ⚠ `pnpm check` 的 `check:generated` 会在**临时工作区**（`os.tmpdir()/alloy-generated-check-*`）重跑生成链并大量删除，而 WorkBuddy CLI 通过 `NODE_OPTIONS=--require=.../node-language-shim.cjs` 注入删除兜底闸（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`，阈值 **50 次/会话**，**不随回合重置**）。一旦超限，`check:generated` 的 `finally rmSync` 与 `ts-patch` 的锁清理都会被拦，表现为「临时工作区生成失败」——**这不是项目缺陷**，且 `dangerouslyDisableSandbox` 绕不过（兜底是 shim 不是沙箱）。**可行做法**：`cd server && env -u NODE_OPTIONS pnpm check`（去掉注入即等价普通终端；`check-generated.js` 的删除严格限于它自建的临时目录）。失败会留下 `/var/folders/.../alloy-generated-check-*/` 与 `node_modules/.cache/ts-patch/locks/*.lock` 残留。
- 改 `apps/client/src/app/**` 或 `Main.ts` 属 §12.3 显式框架侵入，须声明后 `node scripts/protected-paths-lock.mjs --write`（无选择性重钉，会吸收同批其它未提交漂移）。

## P6 旧协议链清理的既有残留（2026-09-20 复核）

- **已确认干净**：`engine/src/net/direct/**`、`net/session/**`、`protocol/{LegacyPbCodec,ProtocolCodec}.ts`、`server/generated/protocol/client/**`、`ClientPush.ts`、两包 `pbjs` 生成器与 `@arthropoda/protobufjs` 依赖（package.json 与两份锁文件 0 命中）、`genPbjs` 命令、数字协议号（`serviceProto.ts` 与 `record.json` 条目级 `id` 均为 0；Bean 字段级 `id` 是有意保留）。
- **残留 ①（真问题）**：`server/src/http/public/assets/*.js`（GM 后台前端构建产物，2026-07-21 构建）仍含整套 PB 工具（`protobufjs` + 调 `/adjust/downloadProto`、`/adjust/getPbJs`），而后端控制器 `wstool.ts` 已随 P6 删除 ⇒ 该面板是**死功能**。修它要回前端源仓重新构建，不在本仓范围。
- **残留 ②（死声明，仍在生成链里）**：`runtime/protocol/C2S/base.ts` 的 `PushChange`（仍登记 `'base/PushChange'`）、`runtime/protocol/C2S/ModInfo.ts`（旧 mod 同步协议描述，生成器只产出 `import {} from`）、`MsgType.MessageS2Client`（0 使用点）。
- ⚠ 别把 127 条 `generated/protocol/server/C2S/actions.ts` 当死表：`ProtocolConfigMgr.execAction` 仍由 `executeInternalAction.ts`（内部 HTTP 动作入口 `type: 'adjust'`）驱动，GM 后台靠它。
