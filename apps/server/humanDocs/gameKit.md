# gameKit 正式生产上线缺口审计

## 结论

`gameKit` 已经具备一套较完整的服务端正确性底座：Redis/MySQL 分工、用户锁与 fence、UoW、幂等、outbox、冷档、排行榜、结算证据链、Colyseus 房间和基础集成测试都已经有代码或验收路径。

但它现在仍是“可运行的服务端骨架 + demo 业务”，距离正式上线还缺一层生产工程：可重复部署、进程托管、配置与密钥管理、完整监控告警、备份恢复演练、外部服务故障策略、运营后台、数据修复、灰度发布和真实客户端/网络联调。

本文件把 `/Users/kk/26/eerie-server` 作为参考项目，比较的是框架和上线能力，不把 eerie 已有玩法数量当作 gameKit 的缺口。

本次也加入 `/Users/kk/26/alloy/alloy-server` 及其 `alloy-engine`。Alloy 的结论只依据已读取的源码、脚本和 README；没有检出的能力标为“未检出”，不等同于一定不存在。

## 当前已具备

| 能力 | gameKit 现状 | 证据 |
|---|---|---|
| 服务端启动 | Node 22 + tsx，Colyseus 0.17 | `apps/server/src/index.ts`、`package.json` |
| 实时房间 | GameRoom、Schema、RedisDriver/Presence 配置 | `apps/server/src/rooms`、`app.config.ts` |
| RPC 网关 | LobbyRoom、统一信封、路由扫描、错误规约 | `apps/server/src/websocket` |
| 鉴权 | 微信登录、不透明 token、token_epoch、session 校验 | `apps/server/src/framework/auth`、HTTP account |
| 用户写一致性 | local mutex、Redis lock、fence、UoW、Lua CAS | `framework/locks.ts`、`framework/uow.ts` |
| 货币一致性 | MySQL 事务、ledger、三阶段 outbox、relayer | `modules/economy` |
| Redis 可靠性 | durable/cache 分离、桶路由、Lua NOSCRIPT 重载 | `framework/infra` |
| 冷档 | freeze/thaw、fence 水位、janitor、lazy migration | `framework/archive` |
| 后台任务 | relayer、freeze worker、赛季轮换、compute worker | `modules/economy`、`framework/archive`、`framework/compute` |
| 基础测试 | 单测、集成测试、故障注入、smoke、loadtest 脚本 | `apps/server/test`、`tools` |
| 无栈联调 | mock HTTP、Playground、monitor 页面 | `core/http/mock`、服务端入口 |
| 协议单源 | `apps/shared` 同步到客户端 | `scripts/sync-shared.mjs` |
| 事件循环保护 | rpc budget、loop monitor、worker_threads 计算池 | `framework/infra/loopMonitor.ts`、`framework/compute` |

## 上线前必须补齐

### P0：没有这些不应承载真实玩家

| 缺口 | gameKit 当前状态 | eerie-server 对照 | 必须补的结果 | 优先级 |
|---|---|---|---|---|
| 可重复生产部署 | 只有本地 `dev-stack.sh`，没有 production Docker/镜像、主机安装器、发布清单和回滚命令 | `sanguo-docker/docker-compose.yml`、Deploy/模板/环境线路配置、发布脚本 | 固定版本镜像/产物、环境配置校验、apply/check/rollback、发布前 diff 和失败回滚 | P0 |
| 进程托管 | 入口只有 `tsx` start；没有 systemd、supervisor、容器健康重启策略 | supervisor 配置、`server.sh`、跨服/公告服务重启脚本 | service、relayer、freeze-worker、season-rotation、HTTP/监控进程的托管、拉起、退出码和重启策略 | P0 |
| 优雅停服与排空 | `SIGTERM` 只排空在途请求后退出；没有连接排空、房间迁移/拒绝新入房、后台任务协调 | Swoole master/worker 脚本有 stop/reload/wait 逻辑 | drain 状态、停止接新请求、房间关闭通知、超时强杀、发布时零/低损切换 | P0 |
| L7/L4 入口安全 | 未见正式 TLS/WSS、反向代理、WAF、真实 IP、连接级 DoS 策略 | nginx、WSS、CORS、Open IP、Docker nginx 配置 | nginx/云 LB/WAF 方案、TLS 证书轮换、真实 IP、WebSocket 超时/连接数/包大小策略 | P0 |
| 生产密钥管理 | `.env.development` 和环境变量约定；没有 KMS/Secret Manager、轮换和泄露处置 | eerie 仍有配置文件和 secret，但有环境化部署及敏感字段过滤，不能直接视为合格范本 | 微信密钥、DB/Redis 密码、签名密钥、内部 secret 全部外置，禁止进入镜像/日志，支持轮换和吊销 | P0 |
| 备份与恢复 | 有 Redis AOF/PITR 设计和归档逻辑，但没有生产备份脚本、备份加密、异地副本、恢复演练 | `tools/backup_release.sh`、`tools/gameMirror/service/bakup.go`、Redis RDB/数据库恢复工具 | MySQL、Redis durable、归档表的 RPO/RTO、加密备份、异地保存、定期 restore 演练和 runbook | P0 |
| 数据库发布 | 有 bootstrap/schema.sql 和 migration 约束，但没有线上 migration gate、锁表/大表变更流程 | Laravel migrations、Deploy 的 DB 模块、线上环境脚本 | migration 版本账本、发布前检查、备份前置、大表变更策略、失败恢复和只读/回滚方案 | P0 |
| Redis 生产拓扑 | 支持路由文件和双实例，但没有 sentinel/cluster/主从切换演练或容量水位自动化 | eerie 按 center/user/server Redis 及区服配置部署多个实例，配监控和 RDB 工具 | 明确单实例、哨兵或集群方案；故障切换、容量、淘汰策略、扩容和数据迁移都要演练 | P0 |
| 数据丢失告警闭环 | 有 `USER_DATA_LOST`、loop/Redis 监控代码；没有告警平台、通知路由和 on-call 机制 | MonitorController、SentryController、日志/监控服务、运营告警 | 指标、日志、trace、告警规则、值班人、升级路径、告警去重和恢复通知 | P0 |
| 真实网络联调 | 当前主要是 mock、Colyseus testing 和本地脚本，没有正式客户端 SDK/WSS/断线恢复验收 | eerie 有客户端/HTTP/WS、固定区服和工具链联调入口 | 真机/弱网/断线/重连/切后台/热更新/多区服验收，覆盖微信登录和 WSS | P0 |
| 生产认证闭环 | wx-login 代码存在，但账号绑定、微信回包异常、频控、封禁后台、密钥轮换等上线流程未闭合 | eerie 有 HTTP Controller、CenterLogin、SSO、后台用户/封禁能力 | 微信真实环境回调、账号生命周期、封禁/踢下线操作、审计和风控策略 | P0 |
| 支付闭环 | wx-notify、订单和 outbox 有实现；缺少商户证书、签名验签、重放、对账、退款/补单运营流程 | eerie 有 PayCallback、PayNoticeService、GM Pay/Recharge、订单模型 | 商户配置、回调验签、幂等、金额校验、对账、退款、补单、死信和人工审计 | P0 |
| 客户端状态同步闭环 | Schema/Push 已有，但持久档 Lobby 状态、首次快照、重连、版本兼容还没有真实客户端验收 | eerie Mod/Bean 差分同步在 engine/NetTask 中形成完整链路 | 真实 Cocos 客户端接收器、版本号、断线重连、重复/乱序推送和旧客户端兼容测试 | P0 |

### P1：上线后很快会遇到

| 缺口 | gameKit 当前状态 | eerie-server 参考 | 建议实现 |
|---|---|---|---|
| 统一健康检查 | 有 `/version`、`/clock/now` 和 mock health；没有 readiness/liveness 分层 | `MonitorController` 检查 Web、Redis、注册数等 | `/live` 只看进程，`/ready` 检查 Redis/MySQL/路由/关键依赖；发布系统只依据 readiness |
| 指标体系 | console、loopMonitor、rpc-budget；无 Prometheus/OpenTelemetry 指标规范 | Sentry、LogChannels、monitor、ClickHouse/统计服务 | RPC QPS/延迟/错误、Redis/DB 池、锁等待、outbox、房间人数、推送失败、队列积压、资源水位 |
| Trace 与关联 ID | RPC envelope 有 id；部分日志有 type/uid，缺统一跨 HTTP/WS/worker trace | eerie 有日志通道、异常平台、任务日志 | traceId、requestId、uid 脱敏关联、Redis/MySQL/worker span，禁止把 token/Prompt/业务敏感值写入日志 |
| 结构化日志 | 主要是 console.warn/error | Winston、文件通道、按服务/区服日志、日志锁 | JSON 日志、级别、采样、轮转、保留期、脱敏和集中采集 |
| 告警与值班 | 代码有告警计数，没有通知配置 | Monitor/Sentry/日志监控、Supervisor 进程状态 | Pager/IM/短信路由、P1/P2 分级、告警抑制、演练和 on-call runbook |
| 配置中心与环境 | `.env` + TS/config，area/notice 仍有 demo config | platform/version/line 配置，配置发布和 Sentry 脱敏 | dev/staging/prod 分层、schema 校验、hash、变更审批、热加载边界、密钥与普通配置分离 |
| 发布与灰度 | 无 CI/CD、灰度、金丝雀、自动回滚定义 | DeployV2 设计明确 plan/apply/check/delete、staging manifest | CI 构建、制品签名、迁移 gate、按区服灰度、旧版本兼容窗口、自动回滚 |
| 任务可靠性 | relayer/freeze/rotation 有单例 lease；缺统一任务状态台账和运维重跑 UI | Queue、SupervisorCron、ApiQueue、FightReport 等常驻任务 | 任务成功/失败/重试/死信/积压可查，手动重跑有权限、审计和幂等 |
| 队列与跨进程消息 | outbox、match stream、mail stream；没有统一队列抽象和消费监控 | ApiQueue、ServerQueue、CrossQueue、延迟 ZSET、Supervisor worker | 明确消息保留、消费位点、重试、死信、顺序、跨区服/跨服务协议和积压告警 |
| 管理后台/GM | 只有 Playground/monitor/mock，真实运营操作很少 | 大量 GM Service、Adjust、SSO、邮件、封禁、充值、配置、战报工具 | 最小运营后台：封禁/解禁、踢人、补单/补偿、邮件、查档、重放 outbox、任务重跑、审计 |
| 数据修复工具 | 有 lazy migration、bootstrap、部分测试工具；无受控 repair CLI | `adjust`、dataRepair、GM、migration、backup/restore 工具 | 只读诊断、dry-run、变更前后快照、审批、操作人、幂等、回滚和审计 |
| 反作弊和风控 | 有 token、限流、服务端分数和结算证据链；没有设备/IP/行为风控体系 | Open IP、设备白名单、GM/封禁、战报和异常处理 | 登录风控、设备/账号关联、异常频率、战斗重放校验、黑名单、人工复核 |
| 版本兼容 | Schema/shared 有版本概念；缺正式客户端 N/N-1 矩阵 | Bean/protobuf record 和兼容基线 | 协议版本矩阵、滚动发布兼容、旧客户端降级、数据库 schema 双读/双写窗口 |
| 房间扩容策略 | Colyseus 房间和 Redis Presence 配置；没有容量模型和压测报告 | 固定区服、多服务进程和 supervisor 扩展 | 单房间人数、房间创建速率、节点容量、连接迁移、热点房间保护和压测阈值 |
| 依赖和制品安全 | npm lock/TypeScript；没有 SBOM、漏洞扫描、镜像签名 | Docker/Composer/发布工具，但也需补现代供应链治理 | lockfile 固定、SBOM、依赖扫描、镜像最小化、签名、发布制品 hash 和回滚保留 |
| 权限与审计 | 服务端错误/日志为主；缺运营权限模型 | SSO、Adjust 权限、GM 路径和敏感字段过滤 | RBAC、最小权限、操作审计、敏感字段脱敏、双人确认高风险操作 |

### P2：规模和长期运营阶段补齐

| 能力 | 当前差距 | 参考方向 |
|---|---|---|
| 多区服/跨服控制面 | gameKit 文档预留区服地址，但当前主要单区服；无中心调度和区服生命周期管理 | eerie 的 center/cross/server 分层、按 sid 配置、跨服队列 |
| 内容配置发布 | catalog 和少量 TS 配置，Excel 工具尚未成为完整线上配置发布链 | eerie 的 config_game、配置同步、GM 配置和版本线路 |
| 统计与数据仓库 | telemetry/日志基础已有，缺行为事件规范、数仓投递、报表和留存 | eerie ClickHouse、Stat、gameLog、FightReport、数数模型 |
| 热修复/运营开关 | 有环境变量和部分配置驱动，无统一 feature flag/kill switch | eerie platform 配置、Adjust、运营配置入口 |
| 负载与容量模型 | 有 20 客户端 loadtest 脚本，无生产级基准、SLO 和容量表 | eerie 多服务进程/固定区服部署，仍应补统一容量压测 |
| 灾备演练 | 设计了 PITR/fence/冷档，但没有季度演练记录 | eerie 有 RDB 备份/恢复工具，可借鉴为可执行 runbook |
| 隐私与数据生命周期 | 没有账号导出、删除、脱敏留存策略 | eerie 有配置过滤和后台边界，但也需按法规补齐 |

## 与 eerie-server 的差异重点

| 方面 | gameKit | eerie-server | 对上线的含义 |
|---|---|---|---|
| 运行时 | Node/TypeScript/Colyseus，结构简洁 | PHP/Lumen + Swoole，另有 cross/notice 多进程服务 | gameKit 需要自己补 Node 生态的进程托管、制品和线上运维层 |
| 状态同步 | Colyseus Schema + Lobby push；持久档同步接线仍在建设 | engine Bean/Mod/Protobuf 自动差分 | gameKit 必须继续验证首次快照、重连和版本兼容 |
| 数据正确性表达 | fence、CAS、outbox、冷档规则集中且显式 | RedisLock、Queue、Bean/RedisService、数据库和大量业务约定 | gameKit 的核心正确性文档更清楚；eerie 的运行时封装更成熟但需要理解内部语义 |
| 部署 | 本地 stack 和启动命令为主 | Docker、nginx、supervisor、线路配置、发布/重启脚本 | gameKit 最大短板在部署与运维，不在基础业务请求链 |
| 后台能力 | Playground、monitor、mock | GM、Adjust、SSO、支付/邮件/配置/封禁工具 | gameKit 上线后无法只靠开发者脚本处理运营和事故 |
| 任务系统 | 独立 relayer/freeze/rotation，单例 lease | SupervisorCron、ApiQueue、ServerQueue、CrossQueue、多个常驻 worker | gameKit 需要统一任务台账、重跑、死信和监控 |
| 监控 | loop/rpc/Redis/MySQL 代码级监控 | Monitor、Sentry、Winston、文件日志、统计服务 | gameKit 还缺可被值班人员使用的指标和告警产品化 |
| 备份恢复 | 设计有 PITR/冷档，但缺演练工具 | 已有 RDB/数据库备份恢复脚本和运维工具 | gameKit 必须把设计变成带时间目标的演练记录 |
| 配置治理 | TS/env/少量 demo catalog | platform/version/line 配置和生成部署文件 | gameKit 需要配置 schema、hash、审批、密钥分离和发布追踪 |
| AI/开发约束 | shared、codegen、64 条服务端规则、测试契约 | README、模块生成、Bean record、兼容基线、部署约束 | 两边都适合 AI，但 gameKit 要把生产运维约束继续工具化 |

## 三方生产能力对照

| 能力 | gameKit | Alloy | eerie-server | 对 gameKit 的判断 |
|---|---|---|---|---|
| 生产部署制品 | 未见 Docker/生产镜像和完整发布清单；有本地启动/stack | 有 `deploy/docker/Dockerfile`、`scripts/build/package-release.sh`、PM2 配置 | 有 Docker compose、部署模板、线路配置和发布脚本 | P0，优先补制品、manifest、环境校验、回滚 |
| 进程托管 | 未见 systemd/supervisor/PM2 配置 | 有 `deploy/pm2/development.config.cjs` 和 service/http 控制脚本 | supervisor 配置、server.sh、reload/wait 逻辑 | P0，至少覆盖 gateway、HTTP、relayer、freeze、rotation |
| 进程优雅退出 | SIGTERM 排空在途请求后退出 | service/http 入口处理 SIGINT/SIGTERM，具体房间 drain 策略未检出 | Swoole master/worker stop、reload、等待和强杀脚本 | P0，补连接/房间 drain 和后台任务协调 |
| TLS/WSS/反向代理 | 未检出正式 nginx/WSS 配置 | HTTP 服务和配置存在，生产 TLS/LB/WAF 未检出 | nginx、WSS、CORS、Docker 网络配置 | P0，补边缘入口和证书轮换 |
| 多环境配置 | `.env`、TS config、部分 catalog | `config/platforms/<line>`、platform/version/sid 配置 | platform/env/host/server/Redis 配置，Deploy 产物 | P0，补配置 schema、hash 和审批发布 |
| 密钥注入与轮换 | 环境变量约定，未检出 KMS/轮换 | 线路配置含 secret，未检出统一 Secret Manager/轮换 | 配置文件和环境化部署，敏感字段过滤 | P0，三方都不应把现有配置文件直接当作合格密钥治理 |
| 数据库迁移发布 | schema/bootstrap，线上 gate 不完整 | TypeORM migration、migration runner、发布脚本 | Laravel migration、Deploy DB 模块 | P0，补版本账本、备份前置和失败恢复 |
| Redis 拓扑管理 | durable/cache、桶路由；未检出 sentinel/cluster 演练 | center/server/user/subscriber Redis；拓扑依配置 | center/user/server/cross Redis，多实例配置与监控 | P0，补 failover、容量和迁移演练 |
| 备份/恢复 | 有 AOF/PITR/冷档设计，未检出完整生产脚本和演练 | 未检出完整 Redis/MySQL 备份恢复 runbook | RDB、数据库备份恢复脚本和 gameMirror 工具 | P0，至少达到 eerie 的可执行恢复，再增加 RPO/RTO/异地副本 |
| 健康检查 | version/clock/mock health；未分 live/ready | HTTP/diagnostics 存在，专门 readiness/liveness 未检出 | MonitorController 有 Web/Redis/注册检查 | P0，补 `/live`、`/ready` 和发布使用的依赖闸门 |
| 指标 | loopMonitor、rpc-budget、Redis/MySQL 计数 | telemetry、LogChannels、ErrorLogMonitor、配置化日志 | Monitor、Sentry、Winston、统计/ClickHouse | P0，补统一指标、看板、阈值和通知 |
| 结构化日志 | 以 console 日志为主 | Winston/Telemetry、按通道日志；完整集中采集未检出 | Winston/文件日志/日志监控 | P1，补 JSON、轮转、脱敏和集中采集 |
| 异常追踪 | 错误码和 console，未检出 Sentry/OpenTelemetry | Telemetry 和 error log monitor；外部 trace 平台未检出 | SentryController、日志监控和告警机器人 | P1，补 traceId、span、错误聚合和 on-call |
| 告警值班 | 监控代码有，通知/on-call 未检出 | ErrorLogMonitor 可发机器人通知，完整值班流程未检出 | Monitor/Sentry/Robot 通知，仍需按业务落地 | P0/P1，必须有分级、升级和恢复通知 |
| 可靠任务 | relayer、freeze、rotation、compute worker，有 singleton lease | cron、DelayedActionQueue、QueuedLocalAction、任务错误码 | SupervisorCron、ApiQueue、ServerQueue、CrossQueue | P1，补任务台账、积压、死信、重跑和审计 |
| 跨进程消息 | outbox、match/mail stream；统一消费台账未检出 | LocalAction、C2S/S2S、QueuedLocalAction；跨进程可靠性需逐链路确认 | ApiQueue/ServerQueue/CrossQueue/延迟 ZSET | P1，补消费位点、重试、死信、顺序和积压告警 |
| 运营后台/GM | Playground/monitor/mock，真实 GM 很少 | Adjust、SSO、GM、Swagger、机器人批量计划、错误日志控制器 | GM Service、Adjust、SSO、邮件、封禁、充值、配置和战报工具 | P0，Alloy/eerie 都证明这是独立上线面，不能只靠脚本 |
| 数据修复 | lazy migration、bootstrap、测试工具 | `tools/operations/repair`、Adjust change、migration 工具 | dataRepair、Adjust、GM、backup/restore 工具 | P1，补 dry-run、前后快照、审批、审计和回滚 |
| 权限审计 | RPC 鉴权；运营 RBAC/操作审计未检出 | SSO/Adjust 权限和 AI 访问审计已有 | 后台登录、权限和敏感字段过滤 | P0，补 RBAC、高风险二次确认和完整操作日志 |
| 登录/封禁 | wx login、token epoch、session；运营封禁入口不足 | User session、GM forbid、SSO；微信生产配置仍需部署 | CenterLogin、封禁、SSO、Open IP | P0，补真实微信回调、风控、封禁/踢人后台 |
| 支付与对账 | 回调、订单、outbox；商户/对账/退款运营未闭合 | pay Controller、checkout、PayClick；证书/对账/退款 runbook 未检出 | PayCallback、PayNotice、GM Pay/Recharge | P0，补商户密钥、验签、对账、退款、补单和审计 |
| 客户端协议生成 | shared TS + sync，Schema/Push | protobuf、Bean transformer、record、compiled JS | protobuf/PB、客户端镜像和版本线路 | P1，补正式 N/N-1 矩阵和真实 Cocos/弱网验收 |
| 状态自动同步 | Schema/Push；持久档 Lobby 同步需显式接线 | Bean/Mod/NetTask 自动差分 | Bean/Mod/Protobuf 自动差分 | Alloy/eerie 在业务字段同步接线更省；gameKit 要补稳定状态适配层 |
| 版本兼容 | Schema version、lazy migration，矩阵未检出 | generated records、compatibility baseline、Bean compile record | 多线路/资源版本管理，完整兼容闸需按发布流程确认 | P1，补协议/档案/客户端滚动升级测试 |
| 构建校验 | server/shared typecheck、路由契约、集成测试 | `check`、generated check、Bean transformer、build artifact、兼容基线 | PHPUnit、配置/发布/运行测试，覆盖面分散 | P1，补一条生产构建唯一闸门 |
| 依赖供应链 | npm lock；SBOM/漏洞扫描/镜像签名未检出 | pnpm lock、Dockerfile；SBOM/签名未检出 | Composer/Docker/镜像仓库；SBOM/签名未检出 | P1，三方都应补现代制品安全 |
| 容量和压测 | loadtest 20 客户端，缺 SLO/容量表 | 未检出完整生产压测报告 | 多服务/区服部署，容量仍需独立测量 | P0，补连接、房间、RPC、Redis、DB、outbox 容量闸门 |
| 灾备演练 | 设计较强，缺定期演练 | 未检出完整演练 | 有恢复脚本，可形成 runbook | P0，不能用设计文档替代恢复记录 |
| 多区服/跨服控制面 | 区服地址有预留，当前以单区服为主 | `--sid` 固定区服，S2S/本地 Action；中心控制面需按部署核实 | center/cross/server 分层和跨服队列 | P1/P2，正式多区服前补中心调度与生命周期管理 |

## 生产缺口重新排序

| 优先级 | gameKit 应补的模块/特性 | 参考来源 | 完成判据 |
|---|---|---|---|
| P0-1 | `deploy/` 生产制品、配置校验、PM2/systemd/supervisor 托管、TLS/WSS、优雅 drain | Alloy Docker/PM2；eerie Docker/nginx/supervisor/server.sh | staging 可重复部署、健康检查通过、灰度和回滚成功 |
| P0-2 | secrets、MySQL/Redis 备份恢复和故障切换 | eerie backup/gameMirror；Alloy migration/build | 恢复演练有 RPO/RTO 记录，密钥可轮换，迁移失败可恢复 |
| P0-3 | `/live`、`/ready`、指标、结构化日志、trace、告警和 on-call | eerie Monitor/Sentry；Alloy telemetry/ErrorLogMonitor | 故障能自动告警、定位、升级并在恢复后闭环 |
| P0-4 | 微信登录/封禁/踢人、支付验签/对账/退款/补单、最小 GM/RBAC | Alloy GM/SSO/Adjust；eerie GmService/Callback | 运营不需要直接改 Redis/数据库，所有高风险操作可审计 |
| P0-5 | 真实客户端、WSS、重连、状态自动同步、旧版本兼容 | Alloy Bean/Mod；eerie 多线路客户端/协议 | 真机/弱网/切后台/重连/滚动发布验收通过 |
| P1-1 | 可靠任务控制面：台账、积压、死信、重跑、消费位点 | gameKit outbox；Alloy Queue/DelayedAction；eerie 多队列 | 每个后台任务可查、可重试、可审计，重复执行不造成副作用 |
| P1-2 | 数据修复、配置发布、内容版本和热修复开关 | Alloy Adjust/operations；eerie Adjust/config/deploy | dry-run、审批、前后差异、回滚和操作记录齐全 |
| P1-3 | 容量压测、SLO、依赖供应链和制品签名 | 三方均有部分基础但无完整闭环 | 生产容量、依赖漏洞、制品 hash 和回滚保留均有自动闸门 |
| P2 | 多区服控制面、数仓、复杂风控、隐私生命周期 | eerie center/cross/stat；Alloy sid/module/telemetry | 业务规模达到对应阶段再建设，不阻塞单区服首发 |

## 不能直接照搬的部分

| 参考项目能力 | 不应直接复制的原因 | gameKit 应保留/改造 |
|---|---|---|
| eerie 的大量 shell/配置文件 | 环境绑定强，部分脚本存在强杀和明文配置风险 | 借鉴部署分层、备份恢复和运维入口，重新做 hash/审批/回滚 |
| Alloy 的 Bean 自动保存 | 自动同步和保存顺序依赖 engine 生命周期；保存失败补偿边界需核实 | 借鉴 Bean/Mod 的状态表达，保留 gameKit 的显式提交和 outbox 约束 |
| Alloy 的 PM2 开发配置 | development 配置不等于 production HA 和多实例策略 | 借鉴制品编译及进程控制脚本，补生产环境参数和故障策略 |
| gameKit 的单例 lease/冷档/outbox | 是本项目针对一致性的设计，不能因参考项目没有同样名字就删除 | 继续保留，并把操作、监控、恢复入口产品化 |

## 建议的上线闸门

| 阶段 | 必须通过的闸门 | 产物 |
|---|---|---|
| M0 环境 | production 镜像/制品、配置 schema、密钥注入、进程托管、TLS/WSS | 可重复部署到 staging 的 manifest |
| M1 数据 | MySQL migration、Redis 拓扑、备份/恢复、RPO/RTO、故障切换演练 | restore 记录、容量和故障报告 |
| M2 业务 | 微信登录、区服选择、房间、重连、支付回调、outbox、冷档、排行榜和结算 | 真机/弱网/重试/并发验收报告 |
| M3 运维 | health/readiness、指标、日志、trace、告警、on-call、GM 最小闭环 | 看板、告警规则、值班和事故 runbook |
| M4 发布 | staging plan/apply/check、按区服灰度、回滚、兼容窗口 | 发布单、回滚演练记录 |
| M5 运营 | 封禁/踢人、补偿/邮件、补单、死信重放、数据修复、审计 | RBAC、操作日志、dry-run/repair 工具 |
| M6 压力 | 连接数、房间数、RPC 延迟、Redis/DB 池、outbox 积压、单区服容量 | SLO、容量表和压测基线 |

## 最小优先级清单

1. 先补生产部署、进程托管、TLS/WSS、密钥注入和优雅停服。
2. 把备份恢复、数据库迁移、Redis 故障切换和恢复演练做成可执行命令及记录。
3. 建立 readiness、指标、结构化日志、trace、告警和 on-call。
4. 用真实微信/支付/客户端/弱网环境验收登录、状态同步、重连和回调。
5. 提供最小 GM/运营/数据修复闭环，并把高风险操作纳入 RBAC 与审计。
6. 最后再扩展多区服控制面、统计数仓、热修复和高级风控。

## 边界说明

本审计不把“eerie 已经有很多玩法”列为 gameKit 缺陷，也不把 eerie 的所有现有实现视为生产最佳实践。eerie 的价值主要在于展示部署、进程托管、区服配置、队列/定时任务、GM/Adjust、监控、备份恢复和运营工具这些上线外围能力；gameKit 的锁、fence、outbox、冷档和显式契约仍应作为自己的核心基座继续保留。
