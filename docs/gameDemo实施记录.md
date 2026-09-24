# gameDemo 实施记录

> **2026-09-24 更新**：本文记录的是 gameDemo 首版（原生 kit 工具链 + AtomicHash 存储）的实施过程。该实现已按新框架标准动线重写
> （schema → Action → Bean，共享资源走 Task Worker，跨实体经可靠队列），原生 kit 工具链、`AtomicHash` / `OwnedRoom` 等已移除。
> 当前结构以 [gameDemo 插件](../apps/plugins/gameDemo/README.md) 与 [docs/KIT.md](KIT.md) 为准，下文仅作历史记录。

2026-09-22 开始并完成 P0–P7；2026-09-23 按用户要求改为旧服零改动的独立原生 kit 工具链（P8，见末节）。最终结论见 [gameDemo框架能力验收报告](gameDemo框架能力验收报告.md)。以下保留历史阶段记录，旧工具链接法由 P8 替代。

## P0 当前产物（只读包基线）

- 清单 `apps/kits/gameDemo/kit.json`，版本 `0.1.0`，明确 `serverRuntime: "serverNew"`。
- `GameDemoModule` 原生模块贡献，shared `gameDemo.status` 查询和 Cocos“玩法验证”入口。
- kit 工具新增运行时身份、文件所有权、锁记录、原生生成链和包内原生测试支持。
- 原生包不能夹带引擎、启动器或旧服端点；缺少原生模块生成器的宿主拒装；升级不能换运行时。
- 原生生成失败后恢复生成目录与原有包；Redis 数据清理不支持旧服的 `--drop-data`。
- 旧服端点全集从 shared 的完整协议集按 kit 运行时归属派生，保持双向校验，没有伪造端点。
- 真实服务探针位于 `apps/kits/gameDemo/verify/native-live.cjs`；最初 P0 制品只有只读查询。当前工作树写入能力见下文，尚未作为完整制品发布。

## 已运行的验证

| 项目 | 结果 |
|---|---|
| 初始 kit 工具基线 | 86 项通过 |
| 扩展后的 kit 工具、锁、生成器测试 | 88 项通过 |
| 原生所有权、包边界与 changed 回归 | 24 项通过；后续 changed/失败回滚定向回归 17 项通过 |
| gameDemo 原生模块测试 | 1 项通过；实际注册模块并校验 shared 响应 |
| shared/client 镜像检查 | 通过，既有入库元数据无缺失或 UUID 冲突 |
| 客户端两种类型检查、旧服类型检查 | 通过 |
| FGUI/视图登记检查 | 63 项通过 |
| 官方 Cocos CLI web-desktop 构建 | 退出码 36（成功），产物 `/tmp/gameDemo-cocos-build/web-desktop` |
| 干净兼容宿主安装→原生生成→包内测试→卸载 | 通过；模块 32→33→32；宿主 `/tmp/gameDemo-clean-host` |
| 真实 WebSocket 启动探针 | 通过；在干净宿主上启动真实原生服务、认证并调用 `gameDemo.status`；运行 ID `mucc9p7m` |

干净宿主由当前框架源码去除包清单中的所有文件后建立，依赖链接到已安装依赖，使用实际 `plugin install/test/uninstall` 命令。
它验证文件与生成链，不代表玩法故障验收完成。工具单测另覆盖升级及生成失败回滚。
临时制品 `/tmp/gameDemo-0.1.0.zip` 会随开发重打包；不视为已发布版本。

## 框架与环境修正

- Node 默认版本不符合新服要求，本轮命令使用已校验官方 SHA-256 的 Node 22.23.2，位置 `/tmp/gameDemo-node22`。未修改用户默认 Node。
- 安装 root/npm、serverNew/server/pnpm10、engine/pnpm8 的锁定依赖；未改依赖锁。
- 新服两处超长行做局部格式修正；客户端测试移除不符合当前 Node 类型重载的多余 `undefined` 参数。
- UniFlex 生成脚本原先按 `ui-uniflex` 根解析页面导入，嵌套页面输出无法构建。改为查找唯一原始 TSX 页面并按其目录重定位；重新生成及 CLI 构建通过。
- 新协议只增加只读探针，既有 wire 形状未改，保留现有协议整数并重新生成协议指纹。
- 用户要求仅 CLI；已结束本轮误启动的 Creator GUI 进程，后续不使用图形编辑器。

## 尚未归零的既有问题

- 已修复：旧服端点全集错误地要求 `income.getPending / settleOnline / claimOffline`。为已迁入新服的既有域增加显式 `serverRuntime` 元数据，并递增该域构建期契约版本；原生 kit 归属仍从 kit 清单派生。
- 已修复：新服结构基线的既有 `IncomeNativeLobbyStore.accountsKey` 漏登记。
- 已修复：新服既有格式问题；当前 `pnpm check` 通过。
- 已审核修复：保护路径锁三个既有漂移追溯至 `402cadd3`；保留源码，连同 onPush 框架接缝重新登记，详见末节。
- 本机 3306 的账号认证协议与旧 MySQL 驱动不兼容。使用临时目录下、127.0.0.1:3307 的独立实例验证，不修改现有账号。

## 最终完成状态

P0–P7 已通过：功能、持久化、恢复、完整 0.2.1 制品安装/升级/卸载重装、30 人多进程样例、Cocos 实际双客户端回放、默认传输回归及最终报告均完成。制品和原始证据已复制到工作区的 dist/kits 与 docs/evidence/gameDemo-2026-09-22；这两个产物目录按仓库规则不入库。


## P1 / P2 已实现与证据（2026-09-22）

- 引擎新增公开 `AtomicHash`、`AtomicHashTransaction`、`AtomicOperation`：完整读集条件校验、同 Redis 多字段提交、只读深冻结、持久结果和参数冲突识别。冲突有界重试；网络错误不自动重发，使用原领域 ID 恢复。
- `NativeLobbyAssets` 复用既有金币/道具键；增加统一资产版本，随金币或道具变化一起递增。既有 shop 扣款与 item grant 改走同一结构，防止与 gameDemo 并发覆盖。既有 star/setField 不纳入本次原子性承诺。
- gameDemo 首次开发初始化：每账号每区服一次 5000 金币、一次 100 金币测试邮件；必须显式 `GAME_DEMO_DEV_TOOLS=1`。同号重试与换请求号重复初始化均不重复发资源。
- 商店：灵草/灵露、数量校验、UTC+8 日限购、原子扣金币/加材料/记额度/记回执。跨日重试返回首次结果，不占用新一天额度。
- 邮件：稳定来源去重、离线投递、已读和单封附件领取。最多显示 100 封，满时只移出已领邮件，保留投递凭据；全部未领时拒绝新投递，生产者必须保留待发进度。
- Cocos：资产和商店按钮、分页邮件列表、已读/领取按钮；业务位于 Logic，使用宿主幂等请求端口。只操作官方 CLI，未再次打开图形编辑器。
- 宿主全路由测试从 kit 的 `verify/routes.cjs` 加载其自有场景，仍校验所有本运行时路由确实被驱动。修正既有测试的固定路由数量及过时的 response/sync 测试桩，不缩小路由全集。

| 检查 | 当前结果 |
|---|---|
| 引擎原有行为契约 | 9 项通过；修正既有同步测试桩，使其验证已提交 sync 与业务响应分离 |
| AtomicHash 真实 Redis | 通过；双 OS 进程竞争、同号扣费去重、提交前失败、提交成功但回复丢失、参数冲突、错误类型预检、只读、跨库拒绝和容量上限 |
| gameDemo 原生模块 | 11 项通过；包含限购竞争、跨日重试、离线邮件、并发领取与写失败回滚 |
| 原生宿主全路由 | 21 项通过，包含 kit 自有场景 |
| 客户端逻辑、旧服协议与原生 kit 工具定向回归 | 8 项通过 |
| 新服与客户端类型检查 | 通过 |
| 真实单服 WebSocket | 初始化、购买/重试、邮件已读/领取、资产与邮件 sync 通过；运行 ID `muce1oqy` |
| 开发入口关闭 | 真实服务拒绝发放，运行 ID `mucdadwv` |
| 最新 Cocos 官方 CLI 构建 | 退出 36；产物 `/tmp/gameDemo-cocos-build/web-desktop` |

此阶段真实服务使用已安装框架的隔离宿主副本并更新开发源码，**不是完整 P2 包的重新安装验收**。
代表日志：`/tmp/gameDemo-atomic-test.log`、`/tmp/gameDemo-p2-module-test.log`、`/tmp/gameDemo-p2-native-routes.log`、`/tmp/gameDemo-p2-live.log`、`/tmp/gameDemo-p2-cocos-cli.log`。


## P3 炼丹与英雄（2026-09-22）

- 炼丹开炉将扣料、批次、随机种子/逐炉品质、配置快照和回执一起提交；服务端用持久起止时刻计算完成数。完成领取和提前结束将产物、余料、终态及积分事实一起提交。
- 英雄支持单次/十次培养，材料不足时只消耗实际数量，满 20 级停止扣除，攻击力取 shared 公式；属性版本供后续 Boss 攻击校验。
- 客户端增加英雄、炼丹页；倒计时用服务端锚点和客户端时钟差显示，计时结束不自行发产物。
- 模块测试 15 项通过；原生全路由 21 项通过；新服、客户端两套类型检查通过；官方 CLI 构建退出 36。
- 真实验证 `muces344`：两炉开炉后 SIGKILL，再启动相同宿主。批次 ID、截止时间和保存的种子/结果逐字节一致；成品只领一次，英雄培养回执可重试。
- 代表日志：`/tmp/gameDemo-p3-module-test.log`、`/tmp/gameDemo-p3-live.log`、`/tmp/gameDemo-p3-cocos-cli.log`。

## P4 活动闭环（2026-09-22）

- 引擎公开事务时钟与提交截止条件；业务不接触 Redis TIME/Lua。真实 Redis 契约测试验证请求停顿跨越截止后不写入过期奖励，回调重试走关闭分支。
- 活动实例固定 10 分钟，记录 `running → settling → settled`、流水消费位置、冻结水位、前 20 名和发奖游标。炼丹产物与带活动归属的积分事实同次提交；活动结束后到达的领取仍给丹药，但不计入旧榜。
- 正积分累计，依“分数降序、达到分数的流水序号升序、玩家 ID”排序。只增量更新至多 21 个候选，不扫描全服；20 名外仍可查询本人积分。
- 后台使用现有 CronService，模块 server scope 注册，调度身份含 SID，每秒最多 8 个持久步骤。阶段和游标 CAS 允许重复调度，不依赖进程内锁来保证正确性；不变更 Task Worker/User Task Worker 分发。
- 定榜前消费到冻结水位；前三名奖励配置随活动固化，每封投递与发奖进度一起提交。邮箱满则停留待发，未丢弃奖励；完成后保留 5 秒展示期再开启下一轮。
- Cocos 增加活动页：前 20 名分页、本人积分/名次、阶段/发奖进度、刷新、开发提前结束。提前结束需 `GAME_DEMO_DEV_TOOLS=1`，请求绑定活动 ID，旧 ID 不会结束下一轮。
- 当前模块 19 项、原生全路由 21 项、客户端/旧服契约定向 8 项通过；新服与客户端两套类型检查通过。
- 真实服务 `mucfp4vs`：`--season --restart` 通过。炼丹中强杀重启，领取后 Cron 自动计分；提前结束后断线、再次强杀并重启，离线完成发奖，重连领取；重复领取和结束回执保持首次结果。
- 代表日志：`/tmp/gameDemo-p4-atomic.log`、`/tmp/gameDemo-p4-modules.log`、`/tmp/gameDemo-p4-routes.log`、`/tmp/gameDemo-p4-live.log`。
- 当前真实服务仍为同步开发源码的隔离宿主，不是完整写入版制品安装结果。真实多 Task Worker、P6 和完整生命周期验收未完成。


### P4 补充验收

- `mucft3as` 通过 `--natural`：活动 `1:2` 的起止间隔确实为 600000 ms，不提前结束、不改时钟；炼丹计分后关闭玩家连接，后台按原截止时间定榜并投递。重连后只见一封榜奖、可领取且回执重试不重复加钱。日志 `/tmp/gameDemo-p4-natural-live.log`。
- 补充“前三名只投递第一名后丢弃运行对象，再构造服务续跑”测试；持久游标从 1 继续到 3，第一名不重发。
- P4 官方 Cocos CLI 构建退出 36；日志 `/tmp/gameDemo-p4-cocos-cli.log`。

## P5 仙盟（2026-09-22）

- typed AtomicHash 记录仙盟、成员唯一归属、定向邀请和领域回执；创建、接受、拒绝、离开均由同 Redis 事务提交。接受时同时校验目标身份、仙盟存续、现任盟主和 3 人容量。
- 盟主离开转交给最早加入的剩余成员；最后一人离开持久标记解散。旧盟主签发但尚未接受的邀请失效。加入任意仙盟后清空其他待处理邀请。
- 每玩家最多 20 条待处理邀请；同一仙盟待处理邀请不重复新增，拒绝后可重新邀请。读取时过滤失效邀请，发新邀请前回收失效索引；不扫描全服。
- Cocos 仙盟页显示自己的玩家 ID、成员与盟主，提供名称/目标 ID 输入、创建/邀请/离开、分页接受/拒绝和刷新。其余玩家主动刷新读取权威状态，首版不声称已实现仙盟广播。
- 并发单测：三人竞争两个空位只有两人成功；同一玩家同时接受两盟只加入其一；伪造他人邀请、解散后接受、非盟主邀请均拒绝；提交失败不留半边成员关系。
- 真实服务 `mucg7ac2` 通过 `--guild`：两个认证账号完成创建、定向邀请、接受、重复接受、盟主离开、权威查询确认转交。日志 `/tmp/gameDemo-p5-live.log`。

| 最新检查 | 结果 |
|---|---|
| gameDemo 模块 | 24 项通过（含 P4 部分发奖续跑与 P5 并发场景） |
| 原生宿主全路由 | 21 项通过，含全部 gameDemo 自有路由 |
| 客户端/旧服协议/原生 kit 工具定向回归 | 11 项通过 |
| shared、新服、客户端两套类型检查 | 通过 |
| kit 代码生成检查 | 通过 |
| P5 Cocos 官方 CLI | 退出 36，`/tmp/gameDemo-p5-cocos-cli.log` |

本轮始终使用 CLI 构建，无图形编辑器操作。构建与逻辑测试不等于已完成 Cocos 页面逐按钮的引擎实测，相关场景纳入 P7。当前制品仍是旧 P0 包；完整写入版的宿主能力声明、停止写入/排空、升级卸载还未完成。


## P6 多 Boss（功能与恢复验收通过，2026-09-22）

- 审查结果：现有 `SceneRoom` 是内存战斗对象，未提供本需求的持久恢复、租约代次和原子伤害提交；未将它的存在当成恢复能力证据。
- 引擎新增 `AtomicLease`（持久 fencing epoch、Redis 时钟、同事务写前校验）和 `OwnedRoom`（每房 FIFO、恢复快照、订阅、队列上限）。真实 Redis 验证停顿到租约失效、另一所有者接管后，旧事务不能写入，旧 token 也不能释放新租约；独立房间队列不互相等待。
- 宿主新增 `NativeLobbyRoomHost`：每房独立循环、Action 上下文、启动失败/停机收尾；网络发送位于房间变更 FIFO 之外。`hostsObjectBinding` 复用现有 Task Worker 取余规则，原进程路由器未改变。
- 三个 Boss 由独立 `OwnedRoom` 实例承载。成员选择与代次、局、HP、伤害、冷却、属性版本、攻击回执一起使用封装事务；每次写入包含租约检查。进程恢复读取原局，不重新设置满血。
- 攻击取英雄权威属性并加入事务读集，培养并发变化会迫使重算。实际伤害封顶剩余血量，最后一击只转结算一次；每人冷却跨离房和重连保留。
- 死亡时固定 60 秒刷新时间；排名邮件逐封持久推进，按 `max(1, floor(基础金币 / 名次))` 发给所有有伤害的参与者。结算完成且到原时间才开下一局。每局参与者与房间成员索引上限各 100，满足本轮三房各 10 人样例，并保持处理有界。
- 客户端增加三房列表、进入/换房/离房、HP、前三伤害、本人伤害和攻击按钮。宿主增加可追踪的类型化 `lobbyRpc.onPush` 端口；订阅随页面 signal 解绑，客户端丢弃旧房、旧选择代次和旧版本推送，更新或缺口拉快照；5 秒查询同时支持 worker 恢复后重建订阅。
- 模块测试 27 项通过；新增 Boss 场景覆盖三房隔离、旧选择拒绝、同局恢复、旧所有者拒写、培养后的下一击、末击竞争、已提交首封奖励但回复丢失后的续发、按原时刻只开一次下一局。原生全路由 21 项通过；客户端/旧服契约定向 10 项通过。
- 真实单服 `much7i77`：3 个独立认证账号分别入三房并攻击；逐房独立读取 Redis 验血量和伤害，SIGKILL 整个服务后重启。三个原 `runId`、HP、伤害榜、阶段不变，所有权代次增加；重放旧攻击不重复计分，继续攻击正常，收到各自房间推送，切房后旧攻击被拒绝。
- 代表日志：`/tmp/gameDemo-p6-atomic.log`、`/tmp/gameDemo-p6-modules.log`、`/tmp/gameDemo-p6-routes.log`、`/tmp/gameDemo-p6-live.log`。官方 Cocos CLI 首轮及最新同步构建均退出 36；最新日志 `/tmp/gameDemo-p6-cocos-final.log`。宿主房间循环另有 2 项测试通过，验证慢房不阻塞快房、停机等待在途 tick，以及 Task Worker 归属规则。
- 以上是首轮单进程证据；多 worker、结算中断和有界负载补充结果见下一节。整个 kit 生命周期验收与客户端逐按钮引擎回放仍未完成。


## P7 多进程、负载与交付检查（2026-09-22）

### 实际进程与故障证据

- 新增随包脚本 `verify/multiprocess-live.cjs`，沿用宿主 bearjoylivemulti 配置与启动 harness；拓扑为 master + 1 Event Worker + 2 Task Worker + 2 User Task Worker。原生端口归属用 lsof 与 health 的 PID 交叉核对。
- 玩家请求补齐 `getBindId(internalUid)`，房间请求继续按 Boss 绑定；现有进程路由器、Task/User Task 两池规则不变。接收端增加受 `ALLOY_PROCESS_ROUTE_TRACE=1` 控制的执行记录（带真实 PID），核对初始化、购买、仙盟接受确实覆盖两个 Task Worker。
- `muchq0w5`：30 个真实认证账号，每房 10 人，同时进入、攻击、购买并重放；每房只少 100 HP，重放不多计伤。三个候选人跨 worker 竞争仙盟两个席位，只有两人成功，个人归属与仙盟成员一致。
- 同轮 SIGKILL Task Worker 1：监听进程 PID/代次不变，Task Worker 2 的蛟龙仍能攻击；山君和炎凰恢复原 runId、HP、伤害与阶段，epoch 增加，旧攻击回执可重放，继续攻击和跨进程推送正常。恢复至查询/攻击/推送验证完成约 7963 ms。日志 `/tmp/gameDemo-p7-multi.log`。
- `muchty8b --settlement`：再次完成上述故障验证。随后真实攻击杀死山君，确认伤害总和恰等于最大 HP；已发送 4/40 份奖励时关闭玩家连接并 SIGKILL 房间 worker。恢复后在离线状态续发到 40/40，独立读取每个参与者的稳定来源邮件 ID、数量和金币，确认无重复。重连领取及重复领取只加一次资产。
- 同轮保持真实时钟，等待死亡时已经持久化的 `respawnAt`；到原定 60 秒后仅开下一局 `1:tiger:2`，满血且伤害清空，旧局攻击拒绝。日志 `/tmp/gameDemo-p7-settlement.log`；服务日志 `native-lobby-multi.muchty8b.log`。
- 宿主原有真实多进程协议集 `muchrc7d` 30/30 通过，包括 Task Worker 分布、24 次用户任务在 User Task Worker 3/4 的接收端实际执行、杀监听进程时 master 探针可用、优雅退出释放全部端口。日志 `/tmp/gameDemo-p7-host-multi.log`。

### 本机有界负载样例

- 30 个连接，三房各 10 人。初始并发进入/攻击/重放/购买共 120 次，再做 10 轮每秒每人 2 次查询/重放，共 720 RPC；耗时 10246 ms，约 70 RPC/s（含初始突发）。这是验证负载，不是吞吐上限。
- 含故障/结算/查询在内的整个场景 1113 次请求，成功请求 P50 8 ms、P95 67 ms；14 次拒绝均为脚本预期的满盟、已结束或旧局等业务拒绝，意外失败为 0。
- 测试专用 `event-loop-probe.cjs` 通过 NODE_OPTIONS 继承到真实服务子进程，1 秒输出一组数据；非压测器自身的事件循环。负载窗口每 worker 有 9～10 组有效样本，最差组的 P95 均约 12 ms，最大延迟 15～24 ms；采样分辨率为 10 ms。该轮首次房间故障完整恢复验证约 8797 ms。
- 运行环境仍是本机 Node 22、Redis 6379 与隔离 MySQL 3307，Redis 无持久化；测试承诺覆盖游戏进程故障且 Redis 存活。首次多 worker 启动因 fixture 开启 TypeORM synchronize 发生并发 DDL 冲突；在已由单进程建好表的隔离库关闭 synchronize 后通过，未修改项目发布配置。

### 交付前检查修正

- `native-requires.json` 随包声明原子 Hash/回执/租约、OwnedRoom、资产门面、房间宿主和客户端推送的消费版本；宿主 `native-kit-capabilities.json` 声明支持窗口。install、树上重装与 check 核对，缺失或不兼容在包落盘前拒绝。定向包/锁/codegen 52 项通过。
- `native-data.json` 声明 gameDemo 31 个持久 Hash 键、数据版本 1 和保留策略。结构检查识别 AtomicHash/AtomicOperation/AtomicLease 的构造键，逐项比对，漏登、多登、跨命名空间或不合法版本均拒绝；可选 kit 的键由随包契约管理，不写入固定宿主基线。运行时版本迁移与排空闸仍待接通。
- 宿主 Redis 基线只接受已审查的字段归属变化：原金币、道具和钱包回执 key/格式不变，新增共享资产 revision；同时补录原已存在的 income account key。没有整体重钉协议、Bean 或数据库基线。
- 清理新增代码的 4 处变量遮蔽；仅格式化原有 3 个不符合 Prettier 的文件。模块描述文件依照既有边界只导入本模块登记函数，启动/路由接线移到 `GameDemoRuntime`。旧启动测试补齐 forwardSync 桩，使其继续验证缺失环境配置，而非提前失败在缺少传输端口。
- 修复 Boss/活动协议测试向量的字面量类型推导。P6 将 Boss 容量校验改为共享配置后，按既有 descriptor 字节闸将 Boss 域 contractVersion 由 1 递增到 2；路由 payload/response 形状不变，重新 codegen、sync 并显式重钉协议指纹。

尚待：持久化停止写入/排空/版本迁移闸；完整写入版制品在干净宿主安装、存量升级、卸载重装与数据保留；Cocos CLI 构建产物的页面按钮/列表/倒计时/推送交互回放。总目标保持进行中。


### 本轮最终回归

- `pnpm -C apps/serverNew/server check` 通过：生成物、类型、ESLint、Prettier、启动/结构测试和引擎 9 项契约（`/tmp/gameDemo-p7-check-final3.log`）。
- 全量测试展开后，修复额外三套旧夹具的 sync 收集桩、跨进程 outcome 解包；保留对两种执行路径结果、错误、副作用和转发次数的断言。最终 runtime/startup/modules 合跑 **159 项通过**（`/tmp/gameDemo-p7-native-runtime-modules2.log`）；其余结构、生成器、HTTP、遥测、Bean 编译、tools/errorcode 均已分别通过，未将早期失败的全量命令标成成功。
- kit/锁/codegen **52 项通过**；能力门槛新增用例在最新树上重跑 **3 项通过**。旧服类型检查、客户端类型检查、生成器 freshness、sync 和协议指纹检查通过；客户端与旧服端点全集契约 **10 项通过**。旧服测试必须从 `apps/server` 工作目录运行，以加载正确的装饰器编译配置。
- 真实测试的 master/worker 均已退出，18095/28095/38095 无监听；隔离 Redis/MySQL 保留供后续生命周期验收。清理脚本另增加 PID 启动时间核对，避免长测试后误杀被操作系统复用的 PID。

## P7 持久化生命周期与完整制品（2026-09-22）

- 新增宿主 `NativeKitLifecycle`，状态 `active → draining → drained → detached`；所有 gameDemo 原子结构、幂等回执和房间租约的写入都把生命周期记录放进同一 CAS 读集。已经在执行的事务遇到排空会整笔失败，不能单独扣掉共用资产。
- 维护写权限由异步上下文和 owner/epoch 租约限定。开始排空后不收新业务；已开炉的丹药按原时刻完成、领取并提交积分，活动和已死亡 Boss 的奖励发完；仍存活的 Boss 保存原局 HP/伤害后暂停，不伪造击杀。
- 每个业务 worker 有 10 秒运行租约、2 秒续约，正常停服释放。旧进程过期后不能重新加入写入；即使安装后恢复业务，它仍会被拒绝。运行进程未退出时，安装器在删改文件前拒绝。
- `kit:lifecycle` 复用正式配置解析及 Bean-aware CLI 引导，不启动 MySQL 或玩家端点。运维入口为模块 `api/lifecycle/NativeKitMaintenance.ts`，不是玩家 RPC。
- 包工具必须明确提供 `NATIVE_KIT_PROFILE`。写文件前登记 detached；升级/安装成功后仅回到 drained，需显式 resume。卸载、失败或跳过 postinstall 都保持关闭。数据版本、已有 key 清单持久保留；没有迁移器时拒绝版本变化或删减旧 key。只支持一个代码副本对应一个 centerRedis 部署。
- 真实生命周期测试 `mucjpxz4` 通过：在线阻写、20 秒实际炼丹、在线 detach 拒绝、停服后 detach、恢复期间继续拒写、恢复后相同 Boss 局/HP/完整伤害列表、继续攻击及产物不重复领取。入口 `verify/lifecycle-live.cjs`；日志 `/tmp/gameDemo-p8-lifecycle-live.log`。

### 完整包验收

本轮可写测试制品为 `/tmp/gameDemo-0.2.1.zip`，107 个文件。`0.2.0` 是验收用前置版本，`0.2.1` 修正运维 API 文件命名，仍保持数据版本 1。均是本地测试制品，未审核发布。

在 `/tmp/gameDemo-clean-host` 已执行真实包工具流程：

1. 把先前复制开发源码的 fixture 显式吸收为 0.2.0 作者锁（仅用于准备升级前置，不计干净安装证据）。
2. 经正式 zip install 升级至 0.2.1，写入 4 个变化文件、保留 103 个、删除旧运维入口 1 个；锁来源 tree → package。
3. 经正式 uninstall 删除全部 107 个包文件；原生模块 33 → 32，模块目录、包锁、客户端入口/视图和 shared RPC 注册引用全部消失。
4. 在上述已清空宿主上仅用同一 zip 重装，107 个文件全部由制品写入，模块 32 → 33；随后执行安装包自带测试并启动实际多进程服务。没有在重装后向模块目录补复制源码。

使用公开 `AtomicHash.scan` 在关闭状态下审计全部 31 个业务 key。升级后、卸载后、重装后的 **780 条记录、逐键 SHA-256 均与升级前一致**；卸载时控制状态为 detached，重装后为 drained。扫描前后控制 epoch 变化即拒绝该审计结果。
代表日志：`/tmp/gameDemo-p8-real-upgrade2.log`、`/tmp/gameDemo-p8-real-uninstall.log`、`/tmp/gameDemo-p8-clean-reinstall.log`、`/tmp/gameDemo-p8-after-{upgrade,uninstall,reinstall}-audit.log`。

### 当前验证结果

| 检查 | 结果 |
|---|---|
| 新服 `pnpm check` | 通过，包含生成物、类型、lint、格式、结构/启动及 9 项引擎契约；日志 `/tmp/gameDemo-p8-full-check8.log` |
| 新服 modules/runtime/startup | 165 项通过；包含 5 项持久化生命周期竞争/过期/数据契约测试；日志 `/tmp/gameDemo-p8-final-domain-runtime.log` |
| 安装器/锁/代码生成定向回归 | 53 项通过；校验写文件前拒绝及卸载失败保留文件；日志 `/tmp/gameDemo-p8-kit-all.log` |
| 干净重装包自带测试 | 原生模块 28 项、客户端 6 项全部通过；日志 `/tmp/gameDemo-p8-installed-kit-tests.log` |
| 完整制品多进程复验 | `muck72fx`：30 人、3 房、5 worker，跨 Task Worker 名额竞争、单 worker SIGKILL、原局恢复和推送通过 |
| 本次负载样例 | 720 次定速请求 / 10.222 秒，约 70 RPC/s；成功请求 P50 12ms、P95 83ms；事件循环采样最差 P95 12ms；恢复 12.414 秒。整场 777 次请求、1 次预期拒绝，无非预期失败 |
| 官方 Cocos CLI | 最新 web-desktop 构建退出 36（成功），约 110 秒；`/tmp/gameDemo-p8-cocos-build.log`，未打开图形编辑器 |
| 协议指纹与保护锁 | 指纹 g8/l7 一致；保护锁审核并更新后通过 |

多进程样例与 Cocos 编译、测试共用本机 CPU；以上是开发机样例，不推断生产容量。完整制品多进程日志 `/tmp/gameDemo-p8-installed-multi.log`。

保护锁的三个既有漂移已定位到已提交 `402cadd3` 的成功回包 sync 接入：锁值均等于该提交父版本，当前文件均等于 HEAD，未改写这三个源码。另一个漂移为本任务显式框架扩展 `app/ports.ts` 的类型化、生命周期托管 onPush。核对仅这四处变化后运行规范 writer 更新锁；提交时应明确声明该框架接缝与既有漏更新锁修正。

**剩余退出项**：真实 Cocos 引擎中的按钮/列表/倒计时/推送交互回放（使用 CLI 构建产物，不启编辑器），默认客户端传输回归及最终能力报告。目标仍进行中；不能把 CLI 构建或无头逻辑测试当作界面交互已验收。

### Cocos 构建产物回放发现（进行中）

使用官方 web-desktop 产物启动临时静态服务，再由 CLI 启动独立 profile 的 headless Chrome，通过 CDP 读取真实 Cocos 场景。未打开 Creator 编辑器，也没有用 HTML 仿制页面。
首轮渲染到真实 FGUI 登录按钮（37 帧、98 个场景节点），但发现每帧 `FrameScheduler` 回调报错。构建 JS 把 `[...this.entries]`（Set）变成 `[].concat(this.entries)`，即使零订阅也会把 Set 当回调条目。
已读取安装的 Creator 3.8.8 编译器与项目配置声明，确认项目 `script.loose` 默认为 true；在 `apps/Cocos/settings/v2/packages/project.json` 显式设为 false，以保留标准 iterable 语义。此修复作用在框架构建配置，不修改帧调度、原生传输或各业务循环。重新 CLI 构建退出 36，真实引擎回放同样渲染 37 帧/98 节点，FrameScheduler 错误已消失；产物已改为正确的 `_toConsumableArray(this.entries)`。验证日志 `/tmp/gameDemo-p8-headless-strict.log`、`/tmp/gameDemo-p8-cocos-strict-build.log`。
首轮证据 `/tmp/gameDemo-cocos-headless/pre-strict-report.json` 与 `login.png`；页面目录请求因本次未启动身份服务而失败，这是此启动探针的已知边界，未计作完整交互通过。

## P7 最终退出验收：真实 Cocos、默认通道与报告

- 新增宿主验收工具 `tools/creator-preview/game-demo.mjs`。只加载官方 CLI 构建产物，由命令行启动两个独立 headless Chrome；通过 CDP 鼠标/键盘输入操作真实 Cocos 页面，不调用页面业务方法或注入假 RPC。工具要求明确的构建路径、隔离宿主、线路与 Redis/MySQL 环境变量。
- 最终运行 `muclhtib` 完成 31 个截图步骤：登录、设置、gameDemo 入口、购买材料、真实 50 秒炼丹、领取/升级、提前结束活动、邮件领取与刷新确认、仙盟邀请/接受、三 Boss 切换/攻击、同房推送。
- 同轮 SIGKILL 整个原生服务后，服务健康端点在 12.413 秒恢复。刷新页面并重新登录，处理既有离线收益弹窗后重新进入蛟龙，原 `runId=1:dragon:1`、HP=1590、running 阶段、34 条完整伤害记录均未改变，epoch 25→26；继续攻击后 HP=1580、个人伤害 20→30。此证据为显式重新登录，不冒充自动会话重连。
- 本轮 84 条成功回复、0 条拒绝、console 错误 0。截图经查看，列表、数值和按钮可读可操作；左下角为官方 debug 构建的性能面板，不计作真机性能证据。原始报告 `/tmp/gameDemo-p9-cocos-final/report.json`，已连同 31 张 PNG 和服务日志复制到 `docs/evidence/gameDemo-2026-09-22/cocos-cli/`。
- 首次完整回放 `mucl2xbu` 已通过业务闭环；加入重登录步骤的首轮因未处理既有离线收益模态而等待设置页超时。最终脚本点击实际“确定”按钮再继续；未修改收入/登录业务，没有绕过模态直接调用菜单。
- 默认传输真实回归 `mucl97wx` 9/9：旧通道登录、幂等/推送、断线、自动重连、新原生通道、非法配置拒绝、连接中切换拒绝、双通道并存与旧 GameRoom。0 个未处理异常，使用原客户端 Colyseus 0.17.43 UMD。日志 `/tmp/gameDemo-p9-dual-lobby.log`。脚本连通性预检改为读取显式 Redis/MySQL URL，可指定 `DUAL_LOBBY_NATIVE_ROOT`，默认线路行为不变。
- `npm run test:client` 最终 635/635 通过（`/tmp/gameDemo-p9-client-tests-final.log`）。初跑 3 个既有正则断言对换行/尾逗号敏感；被测 loginFlow 与三个测试文件原内容都等于 HEAD。仅放宽相应空白表达，保留调用点、参数和行为断言，不改登录实现。
- 两种客户端类型检查、sync、76 个保护路径检查通过。原生代码未在最近一次 `pnpm check`、165 项测试通过后继续改变；本轮仅新增宿主回放工具、调整验证脚本/断言及更新文档。
- 0.2.1 zip 的 107 个包文件再次逐字节对比作者工作区与 `/tmp/gameDemo-clean-host`，全部一致；Cocos 构建所用 kit 源码与已安装制品一致。安装宿主仍仅使用 zip 装入的业务文件。
- 最终制品 `dist/kits/gameDemo-0.2.1.zip`，SHA-256 `f568b1c4ac85e47f6e328b62e56963f217d43c5fdaa85e67fa2523b7eb7ccde9`。阶段日志、包字节审计和界面证据汇总到 `docs/evidence/gameDemo-2026-09-22/`。未签名发布，未自动提交 Git。

P0–P7 退出条件已满足，最终能力结论、框架前置、运维步骤和未验证边界见 [验收报告](gameDemo框架能力验收报告.md)。Redis 故障容灾、微信真机和生产容量不在当前完成承诺内。

## P8：旧服零改动与独立原生 kit（2026-09-23）

用户要求 `apps/server/` 完全不改。本轮已撤回该目录全部任务改动，旧 loader、包工具、schema、协议生成和向量目录均恢复 HEAD；备份保留在 `/tmp/gameDemo-isolation-backup/`。旧服协议注册表也恢复原样，不登记 gameDemo 域。

- 清单、文档、协议向量和客户端测试移到 `apps/serverNew/kits/gameDemo/`，避免旧发现根扫描到原生包。
- `apps/serverNew/tools/kit/` 独立实现 generate/pack/install/check/test/uninstall，不调用旧工具。新原生格式只携带真源，安装时生成原生注册表并同步镜像；拒绝越界、符号链接、损坏 ZIP、未登记覆盖、同版本改包、降级及不兼容宿主。
- shared 原生域归 `apps/shared/src/native/lobbyRpc/domains/`，native 合集消费既有通用协议。信封和传输编解码仍从共享真源生成，旧协议全集不增加新域。
- 客户端通过独立 native catalog 接入 PluginHost/ViewMgr，使用类型明确的 `AppPorts.nativeLobbyRpc`。默认传输不自动切换；Cocos View 与 Logic 保持分离。
- 新生成目录、镜像和本地安装状态写入 `.gitignore`。首次准备执行 `codegen:native-kits` → `sync:shared` → 原生 `pnpm generate`。生成物由登记的 writer 管理。

验收结果：

| 验证 | 结果 |
|---|---|
| 原生 `pnpm check` | 生成、类型、lint、格式、结构/启动与 engine 契约全部通过 |
| 原生完整测试 | 通过；TypeScript 汇总 203 项，另有脚本测试 |
| `kit:native test gameDemo` | 服务端模块 28 项、随包客户端 6 项通过，客户端测试独立严格类型检查通过 |
| 原生包工具 | 严格类型检查与 5 项测试通过，覆盖完整性、越界、宿主能力、旧服隔离、版本不可变、降级、符号链接输出等 |
| 客户端主测试 | 629 项通过；另 6 项业务测试已移入 kit，无丢失覆盖 |
| 旧 codegen `--check` | 通过；只读检查原旧生成物，无旧服写入 |
| native 生成、镜像、76 个保护路径、协议指纹 | 均通过 |
| Cocos 3.8.8 官方 CLI | 退出 36（成功）；未打开图形编辑器 |
| Cocos 双账号真实回放 | `mudh3yvf`，31 步、88 个成功回复、0 个错误回复、console 空；未启动旧服 |
| SIGKILL 恢复 | 蛟龙仍为 `1:dragon:1`，HP 1980、完整伤害记录相同；ownerEpoch 2→3；继续攻击后 HP 1970、本人伤害 20→30 |
| 实际安装生命周期 | 无业务源码宿主安装 0.3.0；有数据升级至 0.3.1→卸载→重装，31 个持久键/57 条记录摘要完全一致 |
| 生成失败回滚 | 注入 pnpm generate 失败后，源码、安装锁、native 注册表和镜像恢复为 0.3.1；数据保持 detached；完整重装修复，31 键摘要不变 |
| 旧服字节保护 | 主工作区 `git status --porcelain -- apps/server` 为空；隔离宿主整个安装周期前后旧服摘要相同 |
| 0.3.1 重装后真实服务 | `mudhi70x` 通过资产/商店/邮件链路及三 Boss 强杀恢复、旧攻击回执重放、继续攻击、换房代次拒绝；恢复的三个房间均为第 1 局 |

最新制品为 `dist/kits/gameDemo-0.3.1.zip`，78 个真源文件，SHA-256 `c9f83ceb40df891f52f29dde5fca05ea21ababd3ea0b7ce5e1aeac57fc6dba8c`。隔离宿主 `/tmp/gameDemo-native-host`；原始证据归 `docs/evidence/gameDemo-2026-09-23/`。Cocos 回放使用新格式 0.3.0；0.3.1 仅迁移随包测试/检查配置和说明，业务源码与该回放一致，并完成实际升级/重装验证。

限制：旧 0.2.x ZIP 不兼容新格式；需排空后在具备原生能力的宿主安装。新工具暂只支持代码与 Cocos View，不支持 FGUI 资源、SQL、跨数据版本迁移。未在本轮重复运行旧服真实双通道回归；P7 的旧服启动证据属于历史接法，本轮旧服兼容依据为零字节变更、旧生成物只读校验及客户端默认传输测试。未提交或发布。

全仓 `verify:inventory` 仍被既有文档差异阻挡：`CLAUDE.md` 多一条自动 pull/commit 的 Git 约定。已补齐本次原生命令登记和查出的既有缺项，未改写用户 Git 约定来消除差异。此项不属于上表原生 `pnpm check`，不能宣称全仓 `verify:all` 已通过。

### 2026-09-23：原生客户端登录直达 gameDemo

按用户确认，将原生客户端的 authenticated base 从宣传页切换为宿主指定的玩法首页。宿主选择保存在 `apps/client/src/native/host.ts`；只在显式 native 传输且目标路由已安装时使用，未安装或默认 Colyseus 通道继续走框架首页。装载仍经过 PluginHost，登录和断线恢复共用同一入口。

gameDemo 页面改为 base 层，右上角「设置」打开已接线的宿主设置页，关闭设置回到玩法首页。此次修改框架接缝 `AppRuntime.ts`、`loginFlow.ts` 以返回受控的路由句柄，并更新对应 protected-paths 锁；没有修改 `apps/server/`。

验证：strict/legacy 类型检查、51 项定向测试通过；完整客户端测试 631 项中仅旧保护锁校验失败，重钉后该专项复测通过。native 生成物与双端镜像检查通过。Cocos 3.8.8 官方 CLI 构建退出 36；真实浏览器依次验证登录直达、设置打开/关闭、英雄页、刷新重新登录，无未捕获异常。证据在 `.cache/gameDemo-home/`，已更新 `/tmp/gameDemo-native-cocos-build/web-desktop`（本地 7458 静态服务目录）。

### 2026-09-23：手机竖屏与 Boss 自动战斗（gameDemo 0.4.0）

按已确认的竖屏方案重写七个功能页面。底部固定英雄 / 商店 / 炼丹 / Boss / 更多入口；更多收纳活动、仙盟、邮件。保持纯 Cocos View + Logic 与原生 kit 接入，不改 Main 或旧服务端。Boss 场景用山林、石台、不同 Boss 造型、真实玩家头像与血条呈现；左侧窄榜显示前五，展开显示前十。头像每组六名并支持翻组，不以假玩家填位。

点击 Boss 开始服务端自动攻击，再次点击停止；死亡后仍保留自动攻击意愿，复活后继续。当前配置：玩家 150 HP，每秒一剑，Boss 每 3 秒对自动攻击中的存活玩家反击 55 点，死亡后 5 秒满血复活。复活帧不攻击、不受反击。离房或切房停止旧房间攻击；只切换其他功能页或短暂断线会继续已经选择的战斗，重新进入可查看当前进度。下一局开始默认不自动选中 Boss。

房间 CAS + lease fence 仍为唯一写入边界；玩家 HP、自动攻击、复活截止时间与有序表现事件随血量 / 伤害榜持久化。进入同一局不恢复生命或重置冷却。跨房间 membership 读参与事务，拒绝旧代次命令。恢复保留原状态并每人最多执行一个到期动作，避免离线攻击集中补发。飞剑、反击、复活表现按最近 64 条服务器事件去重；首次快照与超过 2.5 秒的历史事件不重放，不影响权威伤害。

Boss API 升为 v2、native RPC domain 为 v3。沿用已登记的 Redis 封装和持久键；旧记录/幂等回执兼容缺少 battle 与 uid 的情况，读取旧记录补全初始玩家状态。必须同时更新客户端和 serverNew 并重启服务，新客户端不能连接尚未重启的旧协议进程。

CLI 手机构建（无需打开 Creator 编辑器）：

```sh
/Applications/CocosCreator.app/Contents/MacOS/CocosCreator \
  --project "$PWD/apps/Cocos" \
  --build 'platform=web-mobile;debug=false;buildPath=/tmp/gameDemo-mobile-build'
```

`web-desktop` 自带固定宽度网页外壳，不能通过简单缩小窗口作为手机验收；手机输出使用 `/tmp/gameDemo-mobile-build/web-mobile`。

本轮验证结果：

- 客户端 strict / legacy 类型检查、全量客户端 631 项测试通过；gameDemo 原生模块 30 项、随包客户端 7 项、native kit 工具 5 项通过。
- native 生成登记、双端镜像、76 个保护路径检查通过；`apps/server/` 无改动。
- Cocos 3.8.8 官方 CLI 的 `web-mobile` 发布构建成功（退出码 36），未打开图形编辑器。最新已验收输出 `/tmp/gameDemo-mobile-release/web-mobile`。
- 真实双客户端回放 25 步、118 个成功回复、控制台异常 0。覆盖材料购买、实际等待 50 秒炼丹、升级、提前结束活动并领取 1000 金奖励、仙盟邀请接受、三 Boss、多玩家同步、死亡复活、展开榜单与离房。
- SIGKILL 测试服并重启：蛟龙保持 `1:dragon:1`、HP 1465，完整伤害榜与每名玩家血量 / 复活时间一致；继续攻击后 HP 1455。服务端单测另外覆盖自动攻击开启且玩家死亡期间的 owner 恢复，恢复帧不补发离线攻击。
- 浏览器手机视口 320×568、375×812、430×932 均检查通过。此为真实 Cocos Web 引擎验证，未宣称手机真机验收；Boss 与头像采用简化程序绘制造型。
- 原始回放 `/tmp/gameDemo-portrait-final-evidence/`；关键截图、report 与死亡到复活的回复序列复核在 `.cache/gameDemo-portrait/`。回放工具对后续重复运行已将复活判断限定为本次倒下的 UID，避免旧房间历史事件误命中。

制品：`dist/kits/gameDemo-0.4.0.zip`，81 个真源文件，SHA-256 `8cf7a56600409cbe70192c6a7a077f2529e774a9dfc9366dd29bb95865ebde0d`。没有停止或重启用户正在运行的开发服；预览新版前须重启 serverNew，使协议和代码一起更新。

### 2026-09-23：连接失败提示框资源修复

省略 URL 参数会使用默认 2568，本次本地账号目录服务实际在 2570；用户确认完整地址可以访问。gameDemo 原生入口继续显式传入 `?server=http%3A%2F%2F127.0.0.1%3A2570&lobby=native&lobbyUrl=ws%3A%2F%2F127.0.0.1%3A18091`，不更改框架默认传输方式。

错误提示框另有独立资源问题：Cocos 将 UniFlex 图片默认导入为 Texture，缺少 `/spriteFrame` 子资源；补齐后还发现九宫格边距没有进入导入设置。已在资源生成脚本统一生成 SpriteFrame 导入类型及 manifest 对应的四边 border，保留已有 UUID 与其他导入设置。未修改运行时供应商库或 `apps/server/`。

验证：6 项资源 / 输出测试、UniFlex 生成物检查与双端镜像检查通过；CLI `web-mobile` 发布构建成功，291 张导入图片的设置与生成规则一致。真实 Chrome 375×812 视口主动连接未监听的 2568，点击开始游戏，确认「连接失败」提示框可打开及关闭，无缺失资源或未捕获异常。证据在 `.cache/gameDemo-prompt-fix/`。已将发布产物更新至 7458 静态服务目录 `/tmp/gameDemo-native-cocos-build/web-desktop`（目录名保留，内容为手机构建）及 `/tmp/gameDemo-mobile-build/web-mobile`；原有服务进程未重启。

### 2026-09-23：温润青玉按钮

按用户选择的 A 样式统一 gameDemo 按钮：青玉渐变主操作、深青次级操作、圆角细边与禁用态；英雄页将丹药名称与使用数量分开，底部替换为五项图标导航，活动 / 仙盟 / 邮件保持「更多」选中。点击时只移动缩放内部视觉节点，外层命中区域不变；移出取消恢复外观且不执行操作。

皮肤使用少量缓存的 RGBA 纹理及九宫格 SpriteFrame，导航图标同样缓存复用，没有给每个按钮增加 Graphics，也没有新增外部图片依赖。改动归属 kit 客户端，未修改业务协议和服务端。

验证：客户端 strict / legacy 类型检查、632 项客户端测试、镜像检查和 native kit 检查通过。Cocos 官方 CLI `web-mobile` 发布构建成功；Chrome 检查 320×568、375×812、430×932 布局，回放英雄 / 商店 / 炼丹 / Boss 列表 / 活动 / 仙盟 / 邮件导航，并实测按下与移出取消。截图和报告在 `.cache/gameDemo-jade/`。已更新 7458 静态目录和 `/tmp/gameDemo-mobile-build/web-mobile`，无需重启服务端。本轮未重新分发 ZIP，既有 0.4.0 ZIP 不包含本次样式，后续打包从最新真源生成。

### 2026-09-23：缩短炼丹时间

规则版本升为 2，每炉从 10 秒调整为 2 秒，5 炉共 10 秒。丹房提示从 shared 配置读取耗时和材料数，不再写死文案。已有批次保留开炉时记录的 durationMs / endsAt；客户端旧版本批次倒计时用例继续保留 10 秒数据验证这一点。

验证：gameDemo 服务端 30 项、客户端 7 项测试通过，覆盖新时长下的提前结束退款、完整领取和幂等；客户端类型检查、shared/serverNew 编译产物与镜像同步通过。Cocos CLI 发布构建成功，7458 及手机构建目录已更新。运行中的用户服务未重启，须重启 serverNew 才会让新开炉批次使用 2 秒配置。

### 2026-09-23：默认丹药与自动领取

规则版本升为 3，启动资源增加经验丹 / 极品丹各 100。进入 gameDemo 自动调用现有 initialize 写接口，再读取当前资产；保留服务端 GAME_DEMO_DEV_TOOLS 开关。账号记录新增可选 starterPillsGranted，兼容旧记录并只追加一次丹药，不覆盖旧库存或重复发金币。标记、道具与幂等回执同事务提交，用完后重新登录不会补满；只读查询不产生奖励。

验证：服务端 32 项、kit 客户端 9 项测试通过，包括新账号并发初始化、旧账号并发补发、消费后重新进入不补满、失败事务回滚和重试、客户端初始化后读取当前余额。strict / legacy 客户端类型及镜像检查通过；Cocos CLI 手机发布构建成功，已更新 7458 与手机构建目录。既有全流程验证脚本已适配自动领取和初始丹药数量，本轮未重跑全流程。用户运行中的服务未重启，重启 serverNew 后刷新进入即可自动领取。

### 2026-09-23：本地缓存开发账号

按用户要求修改宿主开发登录接缝 loginFlow：未传 devKey 时首次登录生成 128 位随机标识，通过 sys.localStorage 保存为 `<PROJECT_ID>.dev-account.v1`，再调用既有 dev-login 完成注册 / 登录。刷新、重新打开复用该账号；不同浏览器缓存独立。同源多标签共享缓存，支持 Web Locks 时串行化首次生成。显式 devKey 仅临时覆盖，不写入默认账号缓存；非法参数回落缓存。存储不可用时显示提示并停止注册，避免创建无法恢复的临时账号。未持久化登录 token，没有修改服务端身份协议。

新默认账号不接管旧公共账号；旧进度可用 `devKey=dev_local` 访问。清空站点缓存或改变浏览器存储来源后会生成新账号。本次属于用户明确要求的宿主登录功能改动，已重钉 loginFlow 保护锁；未修改 apps/server。

验证：新增缓存首次生成、复用、独立存储、显式覆盖、非法缓存与存储失败用例；637 项客户端测试、strict / legacy 类型、镜像与保护路径检查通过。官方 Cocos CLI 手机构建成功；真实 Chrome 两个隔离浏览器上下文验证不同账号同时在线、刷新恢复及移除 devKey 后恢复默认账号。证据 `.cache/gameDemo-accounts/report.json`。预览 7458 及手机目录已更新，账号缓存功能刷新即可使用；先前服务端丹药与炼丹配置仍须重启现有 serverNew 进程。

## 2026-09-23：即时炼丹与内置 UI 样式

按用户最终确认，2 秒仅为客户端表现。规则版本升为 4，服务端 start 在同一原子事务内扣材料、生成并发放全部丹药、持久化积分事件和幂等回执，返回已结算批次（claimed、durationMs=0、endsAt=startedAt）；不存在新批次倒计时或二次领取。1 / 5 / 10 炉同样立即结算。客户端收到成功回执后播放固定 2000ms 的丹炉脉动与进度动画，动画中阻止重复提交；刷新直接展示已入账结果。存量 v1–v3 批次继续使用原时钟和领取 / 退款路径。

gameDemo 复用宿主内置 ThemeClassic / UniFlex 资源：紫色标题栏、浅色面板、黄主按钮、青功能按钮、绿退出 / 取消按钮以及内置页签和输入框。操作反馈直接打开既有 Confirm 路由。Boss 保持场景和战斗布局。固定皮肤缓存独立持有 SpriteFrame 引用，解决 Confirm 关闭时共享贴图释放导致渲染异常的问题；空闲丹房停止每秒重建节点，避免打断触摸。未新增切图或改动 vendor，宿主需保有 build:uniflex-ui 生成资源。

验证：服务端 35 项、kit 客户端 12 项、完整客户端 637 项测试通过；strict / legacy 类型、native 生成物、双端镜像、协议指纹和保护路径检查通过。真实运行中的 serverNew 提交 10 炉，19ms 回复即已有全部产物，重复请求返回相同回执。官方 Creator CLI web-mobile 构建成功（退出 36），只通过现有 Chrome 9222 验证；动画实测 2037ms、无 finish RPC、动画中刷新保留丹药、重复点击被拦截。回放内置提示框打开 / 关闭后切换英雄、商店、炼丹、活动、仙盟、邮件和 Boss 战场，覆盖 320 / 375 / 430 宽度，无未捕获异常。截图与报告：`.cache/gameDemo-classic/report.json`。

已重启 bearjoy/dev 的 serverNew 多进程服务，4 个 worker 均 READY；已更新 7458 静态目录与手机构建目录，数据库未清理，apps/server 保持零修改。本轮未重新分发 ZIP，既有 0.4.0 制品不包含这些更新。

## 2026-09-23：等级上限与 Boss 血量调整

规则版本升为 5，英雄等级上限由 20 调整为 100；满级攻击力为 505，现有英雄可以继续培养。山君、蛟龙、炎凰的新局最大血量分别调整为 2000、4000、6000，均为原来的 2 倍。存量 Boss 局继续使用保存的最大血量、剩余血量和伤害记录，新数值在下一局生成时生效。

验证：服务端 35 项、kit 客户端 12 项测试通过，包含满级不多扣丹药、Boss 最后一击截断、奖励结算和原局恢复；客户端类型、镜像、native 生成物、保护路径和协议指纹检查通过。真实 serverNew 接口用独立测试账号升至 100 级，确认攻击 505、最后仅消耗所需丹药、满级再次升级被拒绝。官方 Cocos CLI web-mobile 构建成功（退出 36），7458 预览与手机构建目录已更新；serverNew 重启后 4 个 worker 均 READY。未修改 apps/server，未清理已有数据。

## 2026-09-23：链接默认手机竖屏

新增 Cocos web-mobile 构建模板，电脑打开链接按 750×1624 比例居中展示（最大宽 430 CSS 像素，高度受窗口限制），手机竖屏铺满可用区域，无须 Chrome 手机模拟模式。模板在引擎初始化时关闭 exactFitScreen，通过 ResizeObserver 和 screen.windowSize 同步容器尺寸及像素比。gameDemo View 跟随所属 UI 层尺寸重新布局，解决长屏切短屏后底部导航被裁切的问题，不重置玩法数据。

验证：官方 CLI 构建成功，637 项客户端测试、12 项 kit Logic 测试、strict / legacy 类型与镜像检查通过。仅连接现有 Chrome 9222，连续验证 1440×1000、1024×600 桌面窗口，375×812、320×568 手机尺寸，再恢复桌面；每个尺寸均检查画布范围和实际导航点击，无未捕获异常。证据：`.cache/gameDemo-portrait/report.json`。已更新 7458 预览和手机构建目录，无须重启服务端，apps/server 未修改。
