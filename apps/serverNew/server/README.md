# server

## 运行约束

- 固定区服由 `--sid N` 选择；精确 `sN.json5` 缺失时，端口和 `serverRedis.database` 都从基础配置的一号值按 `sid` 递增，存在时可独立覆盖端点并局部覆盖 `serverRedis`。
- 线路配置只读取精确的 `<platform><version>` 目录，且 `platform.json5` 只做顶层浅覆盖；目录或文件缺失时使用基础配置，AI 和运行流程不得**为迁就当前目标**代建目录或回退到其他线路。唯一例外是 `bearjoylive`：它是真实环境联调自检的固定线路（隔离 Redis 库号 + 单进程 + 短认证超时），只允许 `pnpm verify:native-lobby-live` 使用，并必须保持该文件头部注释写明的、与基础配置的三处差异。
- 未指定平台和版本的本地启动或重启固定使用 `bearjoy/dev`；IDE 活动文件不改变目标，`clientHost` / `clientPort` 也不代表部署或 SSH 主机。
- 数据库迁移必须复用已加载的 `config/platforms/` 配置和 TypeORM 数据源；禁止恢复或依赖旧 `config_platform/` 路径。
- MySQL 连接使用显式注入的 `mysql2` 驱动，支持 MySQL 8 的 `caching_sha2_password`，不需要修改现有账号的认证插件。出现 `ER_NOT_SUPPORTED_AUTH_MODE` 时检查 engine/server 依赖是否安装完整、是否仍在运行旧构建。
- 遇到 worker `READY_TIMEOUT`，先检查同一启动时段的 `log/redis/<sid>/`、`log/game/<sid>/` 与实际线路配置中的依赖端点。Redis 连接重试会使初始化一直等待，最终由主控报 READY 超时；先排除连接拒绝、认证失败和数据库不存在，再判断编译或进程池问题，不要仅延长 READY 时限。
- 调试工具 SSO 统一由线路配置控制；`/adjust`、`/config` 和 `/center/sso*` 必须共享服务端认证与写权限边界。
- 上述调试路径的浏览器 `Origin` 默认只放行同源与 `localhost`/`127.0.0.1`/`::1`；仓库配置不得提交开发机局域网 IP 或反代 Origin，需要远程访问时由部署侧线路覆盖并重启管理 HTTP。
- AI 调试能力必须显式配置开放，审计日志不得记录账号、密钥、Prompt 正文、工具参数或业务数据值。
- 多进程下 service 的启动流程在每个 worker 各执行一遍：startup 贡献必须声明 `scope`（`process` 每进程一次，`server` 全区服一次且必须幂等）；全局副作用禁止挂进 `AppStartEvent` 处理器。
- 玩家 Owner 跨进程调用的可选调度字段必须在无值时省略，不能把 `undefined` 写进 JSON-safe IPC envelope。登录建档、离线暂存和退出保存的内部 Action 必须在所有 service worker 的 `LocalActionRegistry` 登记；退出保存也通过玩家 Owner 的 Action 执行，不能在裸连接回调里修改 Bean。
- service 的 dev 启动（`pnpm dev`、pm2 dev、多进程子进程）统一经 `deploy/dev/entrypoint.cjs`；禁止裸 `ts-node/register` 或 transpileOnly —— bean transform 会被静默跳过，垫片的 `_class_info` 金丝雀负责 fail-fast。
- `workerNum`、`taskWorkerNum`、`userTaskWorkerNum` 全为 0 才走单进程；多进程适配模块必须在分支内惰性加载，再动态加载 ESM runtime bundle。`ALLOY_MULTI_PROCESS_ENABLED=0` 仅作显式逃生门，禁止在 bundle/addon 失败时静默降级。
- 内部 HTTP 必须在合并 `sN.json5` 后解析 `internalPort`（缺省为最终 `clientPort + 10000`）；`gmSecret` 为空或端口冲突时 fail-fast，客户端端口不承载内部路由。
- 原生 Lobby transport v2 的 `reply.sync` 与独立 `sync` 帧承载已提交的单用户模块差异（`mods` + `versions`）。当前请求用户的变更只能随 `reply.sync` 返回，不得再额外 push；没有请求上下文或影响其他在线用户的变更才发独立 `sync` 帧。业务 `data` 仍须严格匹配各路由自己的 shared response validator。
- `SyncReceiptTask` 只在 `RedisTask.save()` 成功后读取 `ModSync.autoGetModChanged()`；先提交再冻结 sync、再发 reply/push。⛔ 不得在业务 Action 中途推送，也不得把服务端 Bean 的任意对象绕过 shared `sync` validator 直接写 socket。幂等路由缓存的是 `{ data, sync }` outcome，重放必须返回同一份 sync。
- 原生 Lobby 在本项目只执行 Bean Action；直接写 Redis 的钱包、奖励、私房、共享玩法等业务域归旧 `apps/server`，并由 `NativeLobbyPendingRoutes` 明确排除。⛔ 不得在 `serverNew` 恢复独立业务 Store、伪造 sync，或绕过 `RedisTask` 增加第二套玩家状态。
- Cocos Web 原生 Lobby 预览只接受显式 `?lobby=native&lobbyUrl=<ws(s)://...>`；`lobbyUrl` 必须逐字匹配本次进程的 `NATIVE_LOBBY_PORT`（默认编排脚本为 `18091`）。端口不一致时 WebSocket 建连失败，客户端登录页的“开始游戏”可能没有可见反馈；排查先核对启动日志、TCP 监听和 WebSocket 握手，再检查业务路由。
- 原生预览 URL 的 `server`、`lobby`、`lobbyUrl` 必须是独立查询参数，不能把编码后的 `&lobby=...` 或 `&lobbyUrl=...` 拼进 `server` 值；本地编排默认还需要 WebPlatform `2570/2571`、Cocos 预览 `7458` 与内部动作口 `28090` 同时可达。
- 内部 HTTP 端点（`/health` 与 `/internal/action`）在多进程下由**承担原生 Lobby 监听的 worker** 承载，而不是主控进程。alloy-core 的 worker 侧只接受源角色为 worker 的进程请求，主控的 `requestMessage` 会把 `PROCESS_MESSAGE` 发出去却被对端判为 `INVALID_SOURCE` 丢弃，调用方只能等到超时（表现为内网 HTTP 请求 `socket hang up`）。所以凡是「需要落到某个 worker 执行」的内部动作都不得从主控发起；`/health` 需要的 worker 列表与统计来自共享状态，监听进程读得到。⛔ 不要把端点搬回主控。
- 多进程的独立探针由主控在 `healthPort`（缺省为最终 `clientPort + 20000`）承载：`GET /livez` 只证明主控存活，`GET /readyz` 要求完整 worker 池就绪。监听 worker 重拉时，内部 `/health` 与 `/internal/action` 可暂不可用，但独立探针必须继续可达；探针是只读端点，⛔ 不得在其上增加内部动作。
- `/gm/api` 的原生 Lobby 强制下线沿用内部数值 `role_id`：管理进程只把它投递到目标区服，监听 worker 用当前在线会话中的 `internalUid` 定位连接并复用 4903 `revoked` 语义。⛔ 不要新增持久化的 role_id → 外部 uid 反查表，离线用户必须诚实返回 `kicked: false`，也不得把外部 uid 视为数字。
- Runtime bundle 固定由 `pnpm build:runtime` 生成；bundle 目录与 `build/Release/ts_swoole_runtime_state.node` 的相对位置不可拆开复制。
- 本地使用 Node 22。runtime 源码构建可用 `ALLOY_CORE_ROOT` 指向独立 alloy-core 仓库；迁入仓库只有已构建产物时，显式使用 `ALLOY_CORE_RUNTIME_PREBUILT=1 pnpm dev`，入口先加载校验 bundle 与原生扩展，保留既有多进程配置。缺失或损坏时拒启，production 不接受预编译选项。
- 外置 runtime ESM 必须使用带 `webpackIgnore` 的原生变量 `import()`；否则 NCC 会改写成 bundle 内 lazy context，生产包将无法加载独立的 runtime 文件。
- 排查 Action 路由时可临时设 `ALLOY_PROCESS_ROUTE_TRACE=1`；trace 只输出 API 名、`taskGroupId`、`bindId` 和源/目标 worker，不得扩展为输出用户或请求业务数据。trace 打在 `requestMessage` **之前**，跨进程证据仍需同时观察目标执行或客户端结果。
- 跨进程转发只传已解析对象：字符串路由、业务 payload、可信身份（字符串 uid、内部 uid、`sId`）、源 Worker 首次解析的 `taskGroupId` / `bindId` 与 traceId。目标进程及其同步嵌套调用复用两项结果，不得重算。
- 玩家写入 Owner 记录在 center Redis 的 `PlayerWorkerOwner`，值是 Event Worker 槽位，离线后仍保留。首次登记优先复用在线表或共享内存 `connection_owner(connectionId)`，否则按 uid 稳定分配；映射缺失或超出当前 Event Worker 池时原子重建。
- `RouteAction.processRouter` 同时转发原生 Lobby 对象调用与 LocalAction：`taskGroupId` 为空或 `-1` 时留在普通 Worker（带 uid 的调用回玩家 Owner），非负整数按 `workerNum + taskGroupId % taskWorkerNum` 进入 Task Worker。`bindId` 不参与进程选择，只控制目标进程内串行；空值默认使用 uid。

## 多进程角色选择

- `workerNum` 个 `WORKER`（Event Worker）占槽位 `[0, workerNum)`：玩家 Bean 唯一写入 Owner 属于此池，不等于「持有 WebSocket 连接的进程」。只有槽位 0 监听原生 Lobby 和内部 HTTP；其他进程的推送、同步与踢人回送槽位 0。
- `taskWorkerNum` 个 `TASK_WORKER` 占槽位 `[workerNum, workerNum + taskWorkerNum)`：显式声明非负 `taskGroupId` 的 Action 按取余执行；有此池时首个 Task Worker 承担 Cron、延迟队列及 `scope: 'server'` 启动贡献，否则由槽位 0 承担。不要把 `ServerTask`（每次 Action 的执行/提交生命周期）误当成 Task Worker 进程。
- `userTaskWorkerNum` 个 `USER_TASK_WORKER` 占后续槽位：目前只完成进程池配置、启动与角色登记，当前 `RouteAction.processRouter` **没有**向此池分发 Action；它不是玩家 Owner 池。新增用途必须先明确独立的路由与写入边界，不能仅增大这个数量来分担玩家 Action。
- `MASTER` 没有业务槽位，只管理 worker、重拉和独立健康探针；不要在主控执行 Action 或发起目标 worker 请求。三种数量全为 0 才是 `SINGLE`；启用多进程必须有 Event Worker，不能单开 Task/User Task 池。
- 新 Action 先判断**是否写玩家 Bean**：是则让 `taskGroupId` 为空，由玩家 Event Worker 执行，`bindId` 留空即可默认按 uid 串行；非玩家资源显式提供稳定 `taskGroupId` 进入 Task Worker，并按需要提供独立 `bindId`。Task Worker 不得直接提交玩家 Bean。
- 客户端入口**只有**原生 Lobby；旧二进制网关（`ClientServer` + PB 编解码）已随 P6 删除。多进程下 `CP.service.clientPort` 仍被 alloy-core 绑定，因此该端口上的连接会被显式关闭（1008）而不是静默丢弃帧；⛔ 不要为「让端口安静」恢复旧的帧解析路径。
- 原生 Lobby 的监听进程与转发 worker 必须共用同一份路由组装和进程级执行点；只有持有连接的一端能写 wire 消息，其余 worker 的推送与踢人必须转交监听进程，关闭时卸载进程级路由表。
- worker 意外退出（崩溃 / OOM / SIGKILL）由 alloy-core 自动重拉：同一槽位重新 fork，`generation` +1，`restartCount` +1；重拉走的是**同一套** `onWorkerStart` → `initializeWorker`，所以调度器所有权（`taskWorkerNum > 0` 时归 `workerNum` 那个槽位）也会被重新获取。重启预算是 10s 窗口内最多 5 次，超出即判 crash loop 并**停掉整个 runtime**，因此排查时不要靠反复杀进程复现。崩溃的可观测出口只有主控的 `onWorkerError`：worker 自己的 `onWorkerExit` 只在优雅 drain 时才跑，硬杀根本轮不到它，而 alloy-core 内部的 `context.log` 不落服务进程 stdout —— ⛔ 删掉 `onWorkerError` 会让「崩了又被重拉」在日志里完全无声。
- `QueuedLocalAction` 的立即与延迟调用都先按唯一 `taskId` 持久登记，再由调度 worker 认领；执行成功后 ACK，认领进程崩溃则租约到期后接管，确定失败只重试一次并进入失败清单。业务 Action 通过 `Ctx.backgroundTask` 读取同一个 `taskId`，跨进程调度不得丢失它。
- 可靠任务崩溃接管的小验证运行 `pnpm verify:queued-action-recovery`：它在隔离 Redis DB 中让子进程认领任务后被 `SIGKILL`，再由新 owner 在租约到期后接管并完成，结束时清理一次性 key。
- 关键状态与后续任务不能只依赖提交后回调：生产者应把稳定 `taskId` 随权威业务状态一起保存，重启时按该状态幂等补登记；业务副作用必须用 `taskId` 作为自身存储的幂等操作号。队列只能保证至少一次投递，不能替跨 Redis / MySQL 写入制造不存在的分布式原子性。

## 所有权

- 业务代码归 `src/modules/<module>/`；通用执行机制归 `src/runtime/`，进程组装归 `src/startup/`，运维命令归 `tools/operations/`。
- 模块系统贡献只能在模块根部 `<Module>Module.ts` 声明；注册项使用稳定名称、目标进程和 `before` / `after` 表达顺序，由 `GameModuleCatalog` 统一解析。
- 业务模块静态 import 只允许存在于生成的 `generated/modules/GameModuleRegistry.ts`；startup、HTTP、Telemetry、Cron 和公共脚本不得维护第二份模块清单。
- `src/http/` 只保留管理 HTTP 框架和通用安全外壳，Controller、DTO、校验和处理能力必须由业务模块拥有。
- HTTP Controller 和 Middleware 禁止反向依赖 startup 初始化；共享 HTTP 授权逻辑必须归 `src/http/security/`，避免 Catalog 和装饰器加载期循环。
- 合并旧目录分支时，新增 Controller、持久化模型和共享认证代码必须先迁入当前所有权目录，再通过 `<Module>Module.ts` 接入，禁止恢复旧清单和旧路径。
- 协议 Action 直接承载业务流程；可复用的模块逻辑归 `Action<Module>` 基类并由相关协议 Action 继承，无公共逻辑时直接继承 `GameAction`，禁止新增 `*Flow` 类。
- 属性、评分、活动等功能演进后的状态更新归所属模块的具名业务类；`UserEvent` 只保留用户域共享事件，禁止用空事件方法占位或让功能模块通过它承载本地逻辑。
- 手写类、接口或枚举文件必须与单一主导出同名，避免 `Manager`、`Helper`、`Common`、`Utils`、`Base`、`Misc`、`Shared`、`Other` 等泛化命名。
- 命名审计的两类违规处置不同：泛化禁用词只能改名；`Service`、`Data`、`Info`、`Logic`、`Define` 是语境词，靠 `Action` / `Req` / `Res` / `Push` / `Pb` 前缀或 `Bean` / `Ref` 后缀自动通过，否则改成语境明确的名字，或按「外部/兼容契约身份」在 `scripts/naming-audit/audit-module-names.js` 的 `compatibilityAllowlist` 登记并写明理由。⛔ 不得为让审计变绿把内部实现名加进白名单。
- 命名审计只覆盖手写源码；`src/http/public/` 等前端构建产物不得按服务端源码规则扫描或加入命名白名单。

## 生成和 Bean

- 原生 Lobby 的类型、路由、错误码和校验器从 `apps/shared` 真源编译到忽略的 `generated/lobby-contract/`；运行 `pnpm gen:lobby-contract` 刷新，`pnpm check:lobby-contract` 只读校验。禁止在新框架维护第二份业务协议或修改旧服务端来接入新通道。
- `pnpm generate` 的 Lobby wire 阶段只编译已有的 `apps/shared/src/protocol/lobbyRpc`，不会把 `apps/shared/schema/protocols/C2S` 的新增域生成为 wire。验证可安装模块时必须先从 schema 在干净宿主独立生成 shared 域和路由登记，再编译契约、生成模块索引并实际启动；禁止把旧 `apps/server` 的 codegen 成功当作新宿主安装成功。
- 可分发的原生 Lobby kit 用 `pnpm kit -- pack <source> --out-dir <artifact>`、`install <artifact>`、`check <id>`、`uninstall <id>`；它只拥有自己的 shared schema 与 `src/modules/<id>/`，不接管旧服务端、SQL、客户端或其他宿主文件。安装与卸载会经 `tools/lobby-protocol` 独立刷新 wire，再跑本项目 `pnpm generate`；锁文件记录归属与 sha256，源码漂移时拒绝卸载。需要真实入口闭环时在本地 Redis/MySQL 可达的开发机运行 `pnpm verify:kit-clean-host`，它在隔离宿主启动真实原生 Lobby，⛔ 不使用旧 `apps/server` 的 codegen。
- 新增一个 lobbyRpc 域（`apps/shared` 的 `domains/<域>.ts`）会让旧 `apps/server` 的端点全集闸（`src/websocket/loader.ts`：shared 声明的每条路由都必须有 `src/websocket/<域>/<方法>.ts`）报「shared 已声明但无端点文件」并**拒绝启动**。那是**另一条通道**的工作项，不属于业务玩法开发：⛔ 不要为让它变绿在 `apps/server` 造 fail-closed 桩或伪造业务数据，也不要因此缩窄 wire 契约。业务开发的验收面只有本项目（`pnpm check`、`pnpm verify:module -- <module>`、`test/runtime/protocol/native-lobby-routes.test.ts`），不含 `apps/server` 的测试套件。
- ⚠ **但「不动 `apps/server`」不等于「`apps/server` 下的路径一律不许改」**，两者别混：`apps/server/test/lobbyRpcVectors/<域>.ts` 是**codegen 契约要求的**（`tools/plugin-codegen/lib.ts` 的 `readVectorSidecars` 做双向对齐：每个 domain 必须有同名 sidecar，缺则 `codegen:plugins` 直接失败；域删了还要同批删 sidecar）。新增域必须同批提供最小合法 request/response 向量并重跑 `codegen:plugins`，其产物 `lobbyRpcVectors/index.generated.ts` 由生成器独占，⛔ 不手改。判据：`node --import tsx tools/plugin-codegen/cli.ts --check` 报 `generated plugin artifacts are fresh`。区分标准是**这条路径属于谁的所有权**：codegen/契约面（向量 sidecar、`tools/plugin-codegen/**`）必须跟着改；旧通道的**业务端点与测试套件**不碰。
- `pnpm verify:module -- <module>` 的 `test:module` 一步要求 `test/modules/<module>/` 存在。`income` 这类只由运行时契约套件覆盖、没有模块测试目录的模块会报 `module has no tests`；它们的覆盖在 `test/runtime/protocol/native-lobby-routes.test.ts`，⛔ 不要为凑门禁建空测试目录。

- **C2S 协议真源是 `apps/shared/schema/protocols/C2S/<域>.json`**；业务模块不得保留 `<Module>C2S.ts`，即使只是借用旧 Req/Res/Pb DTO 也要迁为模块内部具名参数或 View 类型。生成器的 `discoverProtocolSources` 只在 S2S 方向扫模块目录，⛔ 不要把新协议写回模块根部 —— 否则同一路由会同时有 schema 与旧 TS 两套声明。`<Module>S2S.ts` 不受影响：S2S 没有 schema 真源，仍由模块根部文件提供。本项目拥有的 schema API 必须有 `src/modules/<模块>/action/Action<域><动作>.ts`；归旧 `apps/server` 的路由只登记 `NativeLobbyPendingRoutes`，生成器不会为它们生成或注册 Action。
- C2S `Res` 的顶层字段是 Action 的写入目标，schema 中不得标记 `readonly`；只读修饰只用于业务不应改写的嵌套快照或目录项。Action 直接写 `res.field`，不要用 `Object.assign` 绕过类型约束。
- 协议与 Bean 兼容记录只存在于 `generated/records/`；正式 `record.json` 缺失时从 Git 恢复，禁止创建空记录或恢复 `resources/`。
- 记录模型变更（例如 P6 移除旧数字协议号）只能**就地迁移**：用 `scripts/generator/migrate/` 下的迁移脚本改写 `record.json`，脚本必须自证 `beans` 段与 `modVersion` 逐字节未变。⛔ 禁止删除整份记录、从空记录重新生成，或手改记录绕过生成器。
- 生成链只产出仍有消费者的产物：`generated/protocol/server/**`（`serviceProto.ts` / `actions.ts` / `mod/**`）与 `generated/records/**`。PB 专属产物（`pb.js`、客户端 `typings/pb/**`）与其生成器已删除；`serviceProto` 只有字符串路由、`type` 与 `serviceType`，不含数字协议号或内联 schema。
- 修改业务 Bean 后先运行生成器更新字段记录；类型检查、测试和启动必须通过项目脚本加载 Bean transformer。
- 统一生成命令必须先刷新 Bean/协议记录，再生成模块索引与错误码；禁止把 `gen:modules` 移到记录刷新之前。
- 新模块增加 `<Module>Errors.ts` 时，在 `<Module>Module.ts` 的 `errorCodes.namePrefixes` 声明所有前缀并运行 `pnpm generate`；公共错误码脚本不得维护业务前缀映射。
- 发布构建先在 `build/compiled/` 生成经过 Bean 转换的 JavaScript，NCC 不得直接编译手写 Bean TypeScript。
- Source Map 只允许作为 Bean 编译校正的临时产物；最终 `build/compiled/` 必须移除 `.js.map` 和映射注释，JS 运行命令不得启用 `--enable-source-maps`。
- 删除或移动源码后，如 `build/compiled/` 旧 source map 导致 `ENOENT`，先清理对应旧产物再完整编译。
- 玩家业务数据默认落 Redis：字段加在所属 Bean 上，随 Action 提交统一写回。MySQL 只承载账号映射（`center_user`）、角色查询快照（`server_user`）与运营/GM/活动配置表，⛔ 不要为玩家业务数据新建表或 typeorm 实体。
- `server_user` 是查询用快照，只在建号、登录、过天、改名和下线时刷新，与 Redis 会漂移；需要准确值必须读 Bean，不得拿它当排行榜、统计或结算的真源。
- Bean 只能在所属 Action 上下文内修改；异步业务必须等待完成，不能让上下文失效后继续写 Bean。
- 业务事件必须显式携带其归属实体；事件处理器不得从全局 `Ctx` 反查玩家或请求数据，因为事件可由不同 Action 或延后阶段发布。
- Bean 集合不是原生集合；修改前核对引擎 API，`DiffArray` 按下标读取只能用 `.at(i)`，禁止按原生数组的 `indexOf` 语义推断。
- **新增业务 API 的固定动线是 schema → shared wire → server generate → Action → Bean**（逐步说明见 `engine/docs/development.md`）：在 `apps/shared/schema/protocols/C2S/<域>.json` 声明 → `pnpm gen:kit-protocol` → `pnpm generate` → 写 `src/modules/<模块>/action/Action<域><动作>.ts` → 字段加在所属 Bean 上。⛔ 不需要新增 Route 文件、Store 或启动注册代码；`generated/**` 一律是产物，不得手改。
- 普通业务 Action **禁止直接 `import RedisInstance`**：Bean setter 由上下文收集变更、随 `RedisTask` 统一提交，手摸 Redis 会绕过提交点与 `ModSync` 同步面。`serverNew` 不保留 Native Lobby 业务 `*Store` 或独立奖励账本；需要钱包事务、私房票据、共享棋盘、跨玩家聚合的域继续由旧 `apps/server` 权威实现，并登记在 `NativeLobbyPendingRoutes`。结构门禁会拒绝 `src/modules/*/lobby/*Store.ts` 与 `NativeLobbyGrants` 复活。

## 测试约束

- `pnpm check` 是提交前唯一非修改式检查入口；`pnpm generate` 只用于主动刷新生成物，检查流程不得改写源码或生成目录。
- 默认测试套件不得依赖已启动的 Redis、MySQL 或外部服务；需要真实环境的集成脚本不要使用 `.test.*` 命名。
- 真实环境联调入口是 `pnpm verify:native-lobby-live`（`scripts/verify/native-lobby-live.cjs`）：它真的 fork 一次服务进程，走真实 Redis/MySQL 与真实 ws 端点，只把不属于本仓的 WebPlatform 身份服务换成进程内桩；断言用 `redis-cli` 直读存储，不复用生产读函数。因此它需要 Redis/MySQL 可达，放在 `scripts/verify/` 而不是测试套件里。
- 真实环境联调只覆盖本项目仍拥有的 Bean 路由；跨进程框架由 `process-pipe`、启动与宿主测试覆盖，不再维护依赖已迁回旧 `apps/server` 业务域的第二套 live 场景。
- ⚠ **启动期全集闸的期望集是「本项目拥有的路由」，不是 shared 声明面**。`apps/shared` 的 lobbyRpc registry 是**两代服务端共有**的 wire 面：MMO 产品线（`chat` / `party` / `world`）在旧 `apps/server` 上实现，只把域加进同一份 registry。因此「归属另一条通道」的路由必须逐条登记在 `src/runtime/lobby/NativeLobbyPendingRoutes.ts`（带原因），`assertComplete()` 校验三条：① 注册面 ⊆ 声明面；② 声明面 ∖ 注册面 ⊆ 登记表；③ 登记表 ⊆ 声明面 ∖ 注册面（**双向对齐**，路由迁走或从 shared 删除都会让登记陈旧 ⇒ 启动即红，强制同批删行）。⛔ 这张表登记的是**归属**不是进度：不要把「本项目该实现但还没实现」的路由登记进去换启动通过，那是把启动期 fail-fast 换成永久静默。新增域时先确认它属于哪条通道——属于本项目就必须真实现，属于另一条通道才登记。
- 真实联调脚本必须显式传 `userRedisDb`（`createHarness({ …, centerRedisDb, userRedisDb })`）。`redis-cli -n <非数字>` **不报错、静默落 db 0**，漏传时夹具会把数据写进 0 号库而服务进程读 8 号库，症状是「登录钩子什么都没做」；`lobbyLiveHarness.cjs` 的 `createHarness` 现已对两个库号做正整数闸硬失败。
- 关闭日志中的 `DisconnectsClientError: Disconnects client`（未处理拒绝，每次关闭打印数条）是**既有基线**：`RedisCache.disconnect`、`RedisInstance.clear`、`EngineInitHelper.stopInfrastructure` 与 P6 前备份逐字节一致，与协议链无关。排查启动或协议问题时不要把它当成回归；修它属于独立的引擎关闭健壮性任务。
- 日常改模块先运行 `pnpm verify:module -- <module>`；提交前运行 `pnpm check`。前者只校验模块索引与目标测试，后者执行完整静态检查、生成物检查和 engine 契约。
- 全局协议、Bean、错误码、数据库和生成产物兼容性只由统一兼容基线维护；模块测试不得重复硬编码路由和字段编号，保留所属业务的可读契约和行为验证。
- 重取兼容基线用 `pnpm update:compatibility-baseline`，但它**无选择性**（会把同批所有漂移一起吸收）：必须先 `pnpm test:compatibility` 拿到漂移清单并逐项确认「只多出预期的合法新增」。重取前后用 JSON 语义比对确认「除预期条目外逐字节等价」，不要用行数或字节数判断。脚本自身会跑一次 prettier（与 `scripts/errorcode/checkErrorCodes.ts` 对基线产物的处理一致），所以 `pnpm check` 的 `format:check` 不会再因为「`JSON.stringify` 把单元素数组摊成多行」而红；`--preserve-core` 同样可用。
- 状态变更测试同时验证响应、实际状态和消耗/奖励；生命周期能力还需验证真实入口能触发，不能仅凭辅助函数测试通过判定业务已接通。
- 调用顺序必须以真实调用记录验证；禁止用源码字符串位置、正则或文件快照代替业务行为测试。
- 编译型测试缓存的签名必须覆盖实际 TypeScript 编译范围及 Bean 兼容记录；不能只缩小签名而保留全量编译。
- 结构测试只检查当前目录所有权、唯一真源、命名和构建入口；禁止保留已完成迁移的旧路径对比、HEAD 内容快照或阶段证据。
- 禁止在测试源码中维护 Bean、错误码、模块或文件总数；新增合法内容应通过契约 diff 审核，而不是修改固定数字。
- 不维护源码文件、类或方法清单来证明目录迁移完成；源码存在性由导入、类型检查和生成契约验证。
- 常规开发与测试不读取部署文档或部署脚本；只有发布、部署和线上排障任务才进入 `docs/deployment.md` 与 `deploy/`。

## 工具边界

- 根目录 `rg` 默认排除生成物和大型基线；需要排查生成契约时显式指定 `generated/` 或对应基线文件。
- 日常开发只检索活动模块；可选玩法先用 `pnpm modules:list --archived` 定位，再显式读取所选归档包及其硬依赖。归档载荷保持 Git 管理，禁止直接修改载荷或覆盖 `generated/records/`；恢复使用 `pnpm modules:add -- <module>`。
- 修改协议 Action 前先运行 `pnpm --silent modules:list --action <module>/<Action>`；需要模块内基类和会话链路时加 `--context`。默认输出只给直接依赖、关联的框架契约和模块验证命令，避免为查询读取无关源码。
- 调用 S2S 本地 Action 时，优先向 `LocalAction.send/call/broadcast` 传协议路由字符串；它会从生成的 `ServiceType` 精确推导请求和响应。传 Action 类仅保留给历史代码兼容。
- 路径别名以所属 `tsconfig.json` 的现有 `baseUrl` 与 `paths` 为准；变更解析规则时同时验证 TypeScript 与 `tsconfig-paths` 运行时解析，禁止新增第二套别名规则。
- 配置类型生成结果归 `generated/configTypes/`；`src/typings/` 只保留仍被编译器和生成器使用的全局声明，禁止恢复旧 `src/autogen`。
- Adjust 运行文档归 `generated/adjust/`，数数工作簿输入归 `scripts/taToModel/source/`；两者都不得重新放入 `resources/`。
