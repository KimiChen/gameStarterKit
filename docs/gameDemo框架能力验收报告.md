# gameDemo 框架能力验收报告

> **2026-09-24 更新**：本文记录的是 gameDemo 首版（原生 kit 工具链 + AtomicHash 存储）的实施过程。该实现已按新框架标准动线重写
> （schema → Action → Bean，共享资源走 Task Worker，跨实体经可靠队列），原生 kit 工具链、`AtomicHash` / `OwnedRoom` 等已移除。
> 当前结构以 [gameDemo 插件](../apps/plugins/gameDemo/README.md) 与 [docs/KIT.md](KIT.md) 为准，下文仅作历史记录。

初次验收：2026-09-22；独立工具链复验：2026-09-23。当前制品为 **gameDemo 0.3.1**，数据版本 1，尚未签名或发布。最新隔离改造结果见末节；下列 P0–P7 数据保留为初次验收记录，其中旧包和旧目录已被末节替代。

结论：这组简化玩法已在独立的 serverNew 模块与 Cocos 客户端中实现。既有进程分发、模块注册和客户端装载机制能够复用；跨对象原子提交、持久幂等、房间所有权恢复和可写 kit 生命周期通过本次框架扩展补齐。详细时间线见 [实施记录](gameDemo实施记录.md)，功能范围见 [实施计划](新框架简化玩法实施计划.md)。

## 1. 交付位置

| 内容 | 位置 |
|---|---|
| kit 清单、能力声明、数据契约、随包真实服务测试 | `apps/kits/gameDemo/` |
| 独立服务端模块 | `apps/serverNew/server/src/modules/gameDemo/` |
| shared 协议、规则和 API | `apps/shared/src/kits/gameDemo/`、`protocol/lobbyRpc/domains/gameDemo*.ts` |
| Cocos Logic/View | `apps/client/src/kits/gameDemo/`；经标准 sync 生成 Cocos 镜像 |
| CLI 双客户端回放工具 | `tools/creator-preview/game-demo.mjs`，属于宿主验收工具，不夹带进 kit |
| 可安装测试制品 | [gameDemo-0.2.1.zip](../dist/kits/gameDemo-0.2.1.zip)（本地产物，dist 不入库） |
| 本地原始证据 | [证据目录](evidence/gameDemo-2026-09-22/)（按仓库规则不入库） |

制品 SHA-256：`f568b1c4ac85e47f6e328b62e56963f217d43c5fdaa85e67fa2523b7eb7ccde9`。共 107 个包文件，与作者工作区及干净重装宿主的对应文件逐字节一致。框架补丁、测试数据库配置、Chrome 驱动不属于包所有权。

兼容宿主须包含本次框架前置，不能把 zip 安装到尚未扩展的旧框架再期待同样能力。安装器核对 `native-requires.json`：AtomicHash/AtomicOperation/AtomicLease v2；OwnedRoom、NativeLobbyAssets、NativeRoomHost、clientLobbyPush、NativeKitLifecycle v1。Cocos 3.8.8 构建配置使用 `script.loose=false`，保留标准 Set/Map 迭代语义。

## 2. 已实现的玩法闭环

| 功能 | 实现及验证 |
|---|---|
| 英雄升级 | 等级、经验和攻击力；消耗普通/极品经验丹，重复请求不重复消耗 |
| 商店与炼丹 | 金币扣减、材料入包、UTC+8 日限购；每炉真实 10 秒、持久化随机结果与配置版本、提前结束返还；重启继续原批次 |
| 冲榜与邮件 | 领取产物产生持久积分事实；10 分钟活动截止、消费完截止前流水再定榜、前三名离线邮件；附件只发放一次 |
| 仙盟邀请 | 创建、邀请、接受/拒绝、3 人容量、单人唯一归属、离盟和盟主转交；跨 worker 竞争最后名额不超员 |
| 多 Boss | 山君/蛟龙/炎凰独立实例；一人只选一房、每秒一击、完整伤害记录、排行与奖励；死亡结算可续发、60 秒后下一局 |
| 原局恢复 | 整个服务或房间 worker 被 SIGKILL 后，恢复相同 runId、HP、伤害和阶段；所有者 epoch 更新，旧写入不污染恢复后的房间 |

开发资源与提前结束入口必须由服务显式开启 `GAME_DEMO_DEV_TOOLS=1`。每账号每区服只初始化一次 5000 金币；测试邮件为 100 金币。

## 3. 框架能力归类

| 分类 | 机制 | 证据或边界 |
|---|---|---|
| 已有机制直接承载 | Native Lobby 鉴权/RPC、模块登记、Bean-aware 引导、Task Worker/User Task Worker 路由、Cocos PluginHost/ViewMgr、shared 单源与生成 | 保持既有分发规则；真实宿主多进程协议集 30/30，包括 User Task Worker 3/4 执行证据 |
| 本次扩展后承载 | `AtomicHash`、`AtomicOperation`、`AtomicLease` | 同 Redis 完整读集 CAS、持久结果回执、参数冲突识别、Redis 时间与所有权代次；业务不写 raw Redis 或 Lua |
| 本次扩展后承载 | `NativeLobbyAssets` | gameDemo 与既有金币/道具共用公开资产结构及 revision，不另建第二套钱包 |
| 本次扩展后承载 | `OwnedRoom`、`NativeLobbyRoomHost`、类型化客户端推送端口 | 按 Boss 绑定 worker；持久状态、恢复租约、订阅和版本过滤；进程中断后原局继续 |
| 本次扩展后承载 | 原生 kit 包所有权、能力/数据版本声明、`NativeKitLifecycle` | 真实可写包安装、存量升级、排空、卸载/重装，缺少框架能力时拒装 |
| 本轮未验证或未提供 | 微信真机、生产容量、Redis 自身断电恢复、跨数据版本迁移、同一代码副本管理多个独立 centerRedis 部署 | 不能由当前开发机样例推断；不兼容数据升级明确拒绝 |

请求并行由既有进程池分发，不加全服大锁。个人请求绑定玩家，共享房间绑定 Boss；对象内部有序执行，跨进程竞争最终由 CAS 和租约判定。活动积分、发邮件、房间结算按有限批次推进，并持久记录进度；不把全榜/全员处理塞进网关单次请求。

## 4. 关键验收证据

| 验收 | 结果 |
|---|---|
| 原生宿主静态/结构检查 | `pnpm check` 通过，含生成、类型、lint、格式、启动/结构及 9 项引擎契约 |
| 服务端测试 | modules/runtime/startup 165 项通过；含生命周期竞争和过期校验 |
| 包工具回归 | 安装器/锁/codegen 定向 53 项通过；干净安装的包自带原生 28 项、客户端 6 项通过 |
| 客户端全量 | 635 项通过；两套客户端类型检查、sync、76 个保护路径字节锁通过 |
| 默认大厅回归 | 9/9；旧通道登录、幂等/推送、断线和自动重连、新旧并存、旧 GameRoom，0 个未处理异常 |
| 活动自然结束 | 实际等待 10 分钟，离线发信与领取通过；提前结束另有服务与 UI 证据 |
| 三房多进程 | 30 个真实 WS 账号、每房 10 人，master + 1 Event Worker + 2 Task Worker + 2 User Task Worker；跨 worker 名额竞争、单 worker 强杀与推送通过 |
| 部分结算故障 | 山君已发 4/40 封时杀房间 worker；离线续发到 40/40，无重发；按原定死亡后 60 秒开下一局 |
| 安装/升级/卸载 | 真正经 zip 升级、删除全部 107 个包文件，再从 zip 干净重装；模块 33→32→33，生成引用相应增删 |
| 数据保留 | 排空状态扫描 31 个业务 key，升级/卸载/重装前后 780 条记录和逐键 SHA-256 完全一致 |
| Cocos 实际交互 | 官方 CLI 构建 + 两个 headless Chrome，31 个截图步骤、84 个成功回复、0 个拒绝、0 条客户端 console 错误；不是 HTML 仿制或 Logic 单测 |

Cocos 最终运行 `muclhtib`：购买后 4700 金币；5 炉倒计时确实经过 50 秒，产出用于升级；提前结束活动后读取并领取第一名 1000 金币邮件，刷新仍为 5700；两个独立账号邀请/接受后均显示仙盟 2/3；三房攻击及同房广播更新通过。

同轮强杀服务后，重新登录并经真实按钮重入蛟龙：`runId=1:dragon:1`、HP=1590、阶段 running、34 条伤害记录保持一致，所有者 epoch 25→26；再攻击 HP=1580，个人伤害 20→30。服务健康恢复耗时 12.413 秒；这是健康端点恢复时间，不包含后续登录点击时间。此段使用显式刷新/重新登录，不将其写成自动会话恢复证据。

原始 [Cocos 报告](evidence/gameDemo-2026-09-22/cocos-cli/report.json)、[恢复截图](evidence/gameDemo-2026-09-22/cocos-cli/29-boss-restored-after-sigkill.png)、[默认传输日志](evidence/gameDemo-2026-09-22/gameDemo-p9-dual-lobby.log)、[包字节审计](evidence/gameDemo-2026-09-22/package-byte-audit.json) 可直接复核。首次重登录回放曾被既有离线收益弹窗遮挡；最终脚本通过实际“确定”按钮处理弹窗后继续，未绕过业务。

全量客户端测试最初有 3 个既有源码正则断言因换行误报；被测登录源码及测试均与 HEAD 一致。仅调整断言容许空白/尾逗号，保留调用链和行为检查后 635/635 通过，没有改写登录流程。

## 5. 负载与恢复承诺的范围

完整制品多进程运行 `muck72fx`：720 次定速请求 / 10.222 秒，约 70 RPC/s；成功请求 P50 12ms、P95 83ms，服务事件循环采样最差 P95 12ms；故障后完成恢复校验 12.414 秒。整个场景 777 请求、1 次预期业务拒绝、无非预期失败。它是本机有界样例，测试同期有编译负载；不代表最大吞吐量。30 人多进程与双 Cocos UI 是分别运行的验收场景。

本次故障保证建立在 **游戏进程被杀而 Redis 仍存活** 的条件上。原生测试 Redis 未启用磁盘持久化，未验证 Redis 丢盘、主从切换或整机掉电。记录/幂等凭据默认保留，长期归档和压缩不在此 demo 内；Boss 每局参与者限制 100、邮箱限制 100、仙盟容量 3。

身份层使用本地 WebPlatform 契约夹具；未对生产身份服务做联调。客户端验证是 Cocos 3.8.8 的 web-desktop 引擎产物，未宣称微信真机兼容性或美术完成度。

## 6. 复现与运维

CLI 构建与真实界面回放命令见 [工具说明](../tools/creator-preview/README.md)。服务端脚本见 [kit 验证目录](../apps/serverNew/kits/gameDemo/verify/README.md) 和 [kit 使用说明](../apps/serverNew/kits/gameDemo/README.md)。测试会写入状态、提前结束活动或强杀自己启动的服务，应使用已隔离配置的宿主。

可写包的升级/卸载顺序：`kit:lifecycle drain` → 停止所有 worker → 设置明确的 `NATIVE_KIT_PROFILE` → 标准包工具 install/uninstall。安装器在改文件前进入 detached，成功生成后回到 drained，显式 resume 才恢复业务。卸载和安装失败保留 detached 与数据，不允许 `--force` 或 `--drop-data` 绕过。完整指令及超时处理见 [生命周期说明](../apps/serverNew/server/src/runtime/kit/README.md)。

通用框架能力与 gameDemo 业务需要一起保留在源码交付中；zip 只含 kit 自有文件。所有代码保留在工作区，未自动提交、推送或发布。

## 7. 最新交付：原生独立工具链（2026-09-23）

`apps/server/` 已恢复为零改动。当前清单位于 `apps/serverNew/kits/gameDemo/`，协议域位于 `apps/shared/src/native/lobbyRpc/domains/`，工具位于 `apps/serverNew/tools/kit/`，入口为 `npm run kit:native -- ...`。客户端经 native catalog 和 `AppPorts.nativeLobbyRpc` 接入。旧服工具、loader 和协议注册表不参与新包生成或安装。

当前制品：[gameDemo-0.3.1.zip](../dist/kits/gameDemo-0.3.1.zip)，78 个真源文件，SHA-256 `c9f83ceb40df891f52f29dde5fca05ea21ababd3ea0b7ce5e1aeac57fc6dba8c`。旧 0.2.x ZIP 不与新格式互通。命令及前置见 [原生工具说明](../apps/serverNew/tools/kit/README.md)。

已在无 gameDemo 业务源码的兼容宿主安装新包，完成实际 0.3.0→0.3.1 升级、卸载、重装及注入生成失败后的回滚/修复。31 个持久键中的 57 条记录逐键摘要一致，旧服目录摘要始终不变。原生检查及完整测试、629 项客户端主测试、28 项服务端模块测试、6 项随包客户端测试、5 项包工具测试通过。

Cocos 官方 CLI 构建成功。双账号真实回放 `mudh3yvf` 共 31 步、88 个成功回复、0 个错误回复、console 空，全程不启动旧服。强杀后恢复相同 Boss 局、HP 1980 和完整伤害记录；继续攻击后 HP 1970、本人伤害 20→30。0.3.1 与回放使用的新格式 0.3.0 业务代码一致，差异为随包测试与说明。

原始报告和日志见 [本轮证据](evidence/gameDemo-2026-09-23/)，完整限制及检查记录见 [实施记录 P8](gameDemo实施记录.md#p8旧服零改动与独立原生-kit2026-09-23)。本轮未重复旧服真实双通道运行；默认传输由客户端回归覆盖，旧服文件和生成物保持原样。

0.3.1 重装后另以真实服务运行 `mudhi70x`：资产、商店、邮件及三个 Boss 原局强杀恢复、继续攻击、回执重放与过期换房请求拒绝均通过。最终 ZIP、作者真源和已安装的 78 个包文件逐字节相同。
