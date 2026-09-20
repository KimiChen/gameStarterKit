# server

## 运行约束

- 固定区服由 `--sid N` 选择；精确 `sN.json5` 缺失时，端口和 `serverRedis.database` 都从基础配置的一号值按 `sid` 递增，存在时可独立覆盖端点并局部覆盖 `serverRedis`。
- 线路配置只读取精确的 `<platform><version>` 目录，且 `platform.json5` 只做顶层浅覆盖；目录或文件缺失时使用基础配置，AI 和运行流程不得**为迁就当前目标**代建目录或回退到其他线路。唯一例外是 `bearjoylive`：它是真实环境联调自检的固定线路（隔离 Redis 库号 + 单进程 + 短认证超时），只允许 `pnpm verify:native-lobby-live` 使用，并必须保持该文件头部注释写明的、与基础配置的三处差异。
- 未指定平台和版本的本地启动或重启固定使用 `bearjoy/dev`；IDE 活动文件不改变目标，`clientHost` / `clientPort` 也不代表部署或 SSH 主机。
- 数据库迁移必须复用已加载的 `config/platforms/` 配置和 TypeORM 数据源；禁止恢复或依赖旧 `config_platform/` 路径。
- 本地 MySQL 账号必须使用当前数据库驱动兼容的 `mysql_native_password`；出现 `ER_NOT_SUPPORTED_AUTH_MODE` 时先检查账号认证插件。
- 调试工具 SSO 统一由线路配置控制；`/adjust`、`/config` 和 `/center/sso*` 必须共享服务端认证与写权限边界。
- 上述调试路径的浏览器 `Origin` 默认只放行同源与 `localhost`/`127.0.0.1`/`::1`；用局域网 IP 或反代地址访问时会被 `sendStatus(404)` 伪装成路由不存在（响应体固定 9 字节 `Not Found`，区别于业务侧 52 字节的「无法找到该玩家」）。必须在该线路 `platform.json5` 的 `adjustOrigins` 中**精确**列出（不支持通配），改本机 IP 后同步更新并重启管理 HTTP。
- AI 调试能力必须显式配置开放，审计日志不得记录账号、密钥、Prompt 正文、工具参数或业务数据值。
- 多进程下 service 的启动流程在每个 worker 各执行一遍：startup 贡献必须声明 `scope`（`process` 每进程一次，`server` 全区服一次且必须幂等）；全局副作用禁止挂进 `AppStartEvent` 处理器。
- service 的 dev 启动（`pnpm dev`、pm2 dev、多进程子进程）统一经 `deploy/dev/entrypoint.cjs`；禁止裸 `ts-node/register` 或 transpileOnly —— bean transform 会被静默跳过，垫片的 `_class_info` 金丝雀负责 fail-fast。
- `workerNum`、`taskWorkerNum`、`userTaskWorkerNum` 全为 0 才走单进程；多进程适配模块必须在分支内惰性加载，再动态加载 ESM runtime bundle。`ALLOY_MULTI_PROCESS_ENABLED=0` 仅作显式逃生门，禁止在 bundle/addon 失败时静默降级。
- 内部 HTTP 必须在合并 `sN.json5` 后解析 `internalPort`（缺省为最终 `clientPort + 10000`）；`gmSecret` 为空或端口冲突时 fail-fast，客户端端口不承载内部路由。
- 内部 HTTP 端点（`/health` 与 `/internal/action`）在多进程下由**承担原生 Lobby 监听的 worker** 承载，而不是主控进程。alloy-core 的 worker 侧只接受源角色为 worker 的进程请求，主控的 `requestMessage` 会把 `PROCESS_MESSAGE` 发出去却被对端判为 `INVALID_SOURCE` 丢弃，调用方只能等到超时（表现为内网 HTTP 请求 `socket hang up`）。所以凡是「需要落到某个 worker 执行」的内部动作都不得从主控发起；`/health` 需要的 worker 列表与统计来自共享状态，监听进程读得到。⛔ 不要把端点搬回主控。
- 多进程的独立探针由主控在 `healthPort`（缺省为最终 `clientPort + 20000`）承载：`GET /livez` 只证明主控存活，`GET /readyz` 要求完整 worker 池就绪。监听 worker 重拉时，内部 `/health` 与 `/internal/action` 可暂不可用，但独立探针必须继续可达；探针是只读端点，⛔ 不得在其上增加内部动作。
- `/gm/api` 的原生 Lobby 强制下线沿用内部数值 `role_id`：管理进程只把它投递到目标区服，监听 worker 用当前在线会话中的 `internalUid` 定位连接并复用 4903 `revoked` 语义。⛔ 不要新增持久化的 role_id → 外部 uid 反查表，离线用户必须诚实返回 `kicked: false`，也不得把外部 uid 视为数字。
- Runtime bundle 固定由 `pnpm build:runtime` 生成；bundle 目录与 `build/Release/ts_swoole_runtime_state.node` 的相对位置不可拆开复制。
- 外置 runtime ESM 必须使用带 `webpackIgnore` 的原生变量 `import()`；否则 NCC 会改写成 bundle 内 lazy context，生产包将无法加载独立的 runtime 文件。
- 排查 `bindId` 路由时可临时设 `ALLOY_PROCESS_ROUTE_TRACE=1`；trace 只输出 API 名、bindId 和源/目标 worker，不得扩展为输出用户或请求业务数据。trace 打在 `requestMessage` **之前**，它证明的是「发起了转发」而不是「已经送达」——拿它当跨进程证据时必须同时有对端的行为观测（对端真的执行了、客户端真的收到了），否则「请求根本没送达」也是绿的。
- 跨进程转发只传已解析对象：字符串路由、业务 payload、可信身份（字符串 uid、内部 uid、`sId`）、源 worker 首次解析的 `bindId` 与 traceId。禁止把客户端原始帧或数字协议号交给目标 worker 重放，目标 worker 也不得重算 `bindId`。
- 客户端入口**只有**原生 Lobby；旧二进制网关（`ClientServer` + PB 编解码）已随 P6 删除。多进程下 `CP.service.clientPort` 仍被 alloy-core 绑定，因此该端口上的连接会被显式关闭（1008）而不是静默丢弃帧；⛔ 不要为「让端口安静」恢复旧的帧解析路径。
- 原生 Lobby 的监听进程与转发 worker 必须共用同一份路由组装和进程级执行点；只有持有连接的一端能写 wire 消息，其余 worker 的推送与踢人必须转交监听进程，关闭时卸载进程级路由表。
- worker 意外退出（崩溃 / OOM / SIGKILL）由 alloy-core 自动重拉：同一槽位重新 fork，`generation` +1，`restartCount` +1；重拉走的是**同一套** `onWorkerStart` → `initializeWorker`，所以调度器所有权（`taskWorkerNum > 0` 时归 `workerNum` 那个槽位）也会被重新获取。重启预算是 10s 窗口内最多 5 次，超出即判 crash loop 并**停掉整个 runtime**，因此排查时不要靠反复杀进程复现。崩溃的可观测出口只有主控的 `onWorkerError`：worker 自己的 `onWorkerExit` 只在优雅 drain 时才跑，硬杀根本轮不到它，而 alloy-core 内部的 `context.log` 不落服务进程 stdout —— ⛔ 删掉 `onWorkerError` 会让「崩了又被重拉」在日志里完全无声。

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

- 模块协议源必须位于模块根部 `<Module>C2S.ts` / `<Module>S2S.ts`；每个 `Req<Name>` 必须先有 `action/Action<Name>.ts`，再运行生成器登记路由。
- 协议与 Bean 兼容记录只存在于 `generated/records/`；正式 `record.json` 缺失时从 Git 恢复，禁止创建空记录或恢复 `resources/`。
- 记录模型变更（例如 P6 移除旧数字协议号）只能**就地迁移**：用 `scripts/generator/migrate/` 下的迁移脚本改写 `record.json`，脚本必须自证 `beans` 段与 `modVersion` 逐字节未变。⛔ 禁止删除整份记录、从空记录重新生成，或手改记录绕过生成器。
- 生成链只产出仍有消费者的产物：`generated/protocol/server/**`（`serviceProto.ts` / `actions.ts` / `mod/**`）与 `generated/records/**`。PB 专属产物（`pb.js`、客户端 `typings/pb/**`）与其生成器已删除；`serviceProto` 只有字符串路由、`type` 与 `serviceType`，不含数字协议号或内联 schema。
- 修改业务 Bean 后先运行生成器更新字段记录；类型检查、测试和启动必须通过项目脚本加载 Bean transformer。
- 统一生成命令必须先刷新 Bean/协议记录，再生成模块索引与错误码；禁止把 `gen:modules` 移到记录刷新之前。
- 新模块增加 `<Module>Errors.ts` 时，在 `<Module>Module.ts` 的 `errorCodes.namePrefixes` 声明所有前缀并运行 `pnpm generate`；公共错误码脚本不得维护业务前缀映射。
- 发布构建先在 `build/compiled/` 生成经过 Bean 转换的 JavaScript，NCC 不得直接编译手写 Bean TypeScript。
- Source Map 只允许作为 Bean 编译校正的临时产物；最终 `build/compiled/` 必须移除 `.js.map` 和映射注释，JS 运行命令不得启用 `--enable-source-maps`。
- 删除或移动源码后，如 `build/compiled/` 旧 source map 导致 `ENOENT`，先清理对应旧产物再完整编译。
- Bean 只能在所属 Action 上下文内修改；异步业务必须等待完成，不能让上下文失效后继续写 Bean。
- 业务事件必须显式携带其归属实体；事件处理器不得从全局 `Ctx` 反查玩家或请求数据，因为事件可由不同 Action 或延后阶段发布。
- Bean 集合不是原生集合；修改前核对引擎 API，`DiffArray` 按下标读取只能用 `.at(i)`，禁止按原生数组的 `indexOf` 语义推断。

## 测试约束

- `pnpm check` 是提交前唯一非修改式检查入口；`pnpm generate` 只用于主动刷新生成物，检查流程不得改写源码或生成目录。
- 默认测试套件不得依赖已启动的 Redis、MySQL 或外部服务；需要真实环境的集成脚本不要使用 `.test.*` 命名。
- 真实环境联调入口是 `pnpm verify:native-lobby-live`（`scripts/verify/native-lobby-live.cjs`）：它真的 fork 一次服务进程，走真实 Redis/MySQL 与真实 ws 端点，只把不属于本仓的 WebPlatform 身份服务换成进程内桩；断言用 `redis-cli` 直读存储，不复用生产读函数。因此它需要 Redis/MySQL 可达，放在 `scripts/verify/` 而不是测试套件里。
- 真实**多进程**宿主入口是 `pnpm verify:native-lobby-multiprocess-live`：它跑与单进程线路**同一份**协议场景集（`lobbyProtocolScenarios.cjs`），再补「只有真实多进程才能证明」的进程池拓扑（四种角色 + 端口归属交叉核对）、跨进程转发/推送痕迹、`bindId % taskWorkerNum` 的**分布**、运营入口落点、**worker 崩溃重拉**与优雅退出。崩溃重拉的判据取 `/health` 的 `generation` 恰好 +1（只在重新 fork 同一槽位时递增）＋新 pid 存活，而不是「配置里写了几个 worker」。⚠ 该线路的 `bearjoylivemulti` 夹具必须保持 `taskWorkerNum ≥ 2`：等于 1 时 `bindId % taskWorkerNum` 恒为 0，「按 bindId 路由」与「永远发给同一个 worker」在外部观测上完全一样，分布类断言会退化成空转（脚本里有 `TASK_WORKER_NUM >= 2` 闸，夹具与脚本常量必须一起改）。两条线路都**不在门禁里**——改了 Lobby 协议、跨进程装配或内部 HTTP 端点归属后必须主动跑。
- 关闭日志中的 `DisconnectsClientError: Disconnects client`（未处理拒绝，每次关闭打印数条）是**既有基线**：`RedisCache.disconnect`、`RedisInstance.clear`、`EngineInitHelper.stopInfrastructure` 与 P6 前备份逐字节一致，与协议链无关。排查启动或协议问题时不要把它当成回归；修它属于独立的引擎关闭健壮性任务。
- 日常改模块先运行 `pnpm verify:module -- <module>`；提交前运行 `pnpm check`。前者只校验模块索引与目标测试，后者执行完整静态检查、生成物检查和 engine 契约。
- 全局协议、Bean、错误码、数据库和生成产物兼容性只由统一兼容基线维护；模块测试不得重复硬编码路由和字段编号，保留所属业务的可读契约和行为验证。
- 重取兼容基线用 `pnpm update:compatibility-baseline`，但它**无选择性**（会把同批所有漂移一起吸收），且写出的 JSON **不满足 prettier**：必须先 `pnpm test:compatibility` 拿到漂移清单并逐项确认「只多出预期的合法新增」，重取后紧跟 `pnpm exec prettier --write test/structure-baseline/compatibility-baseline.json`，否则 `pnpm check` 会红在 `format:check`。重取前后用 JSON 语义比对确认「除预期条目外逐字节等价」，不要用行数或字节数判断。
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
- `tools-cfg.json` 因 game-sync 固定发现规则暂留项目根；密码只能由 `GAME_SYNC_PASSWORD` 注入，禁止重新提交明文凭据。
- 配置类型生成结果归 `generated/configTypes/`；`src/typings/` 只保留仍被编译器和生成器使用的全局声明，禁止恢复旧 `src/autogen`。
- Adjust 运行文档归 `generated/adjust/`，数数工作簿输入归 `scripts/taToModel/source/`；两者都不得重新放入 `resources/`。
