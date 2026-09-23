# gameDemo

基于 `serverNew` 原生模块的可分发玩法验证 kit。客户端使用 Cocos 简单列表、按钮和数值。
实施与验收状态见 `docs/新框架简化玩法实施计划.md`，未完成的阶段不代表可用功能。

- 服务端：`apps/serverNew/server/src/modules/gameDemo`，由 `GameDemoModule` 自动登记。
- shared：`apps/shared/src/kits/gameDemo` 与 `native/lobbyRpc/domains/gameDemo*.ts`。
- 客户端：`apps/client/src/kits/gameDemo`，由 kit 清单登记到 PluginHost/ViewMgr。
- 连接原生大厅：使用宿主的 `?lobby=native&lobbyUrl=...` 参数；默认大厅不变。
- 本项目原生客户端登录后直接进入玩法验证首页；右上角「设置」打开宿主设置面板，关闭设置返回玩法页。首页选择归宿主配置，kit 不自行抢占登录导航。
- Redis 业务操作仅经引擎的数据结构封装；持久化机制不足时补到引擎层。
- 不修改 Task Worker/User Task Worker 分发；房间、活动等共享写入按各自对象串行。
- 客户端按钮、标题栏、列表面板和输入框复用宿主内置 ThemeClassic / UniFlex 资源（通过生成的 resource-map 加载）；提示框使用现有 Confirm 路由。宿主需先运行 build:uniflex-ui。少量导航图标仍使用缓存 RGBA SpriteFrame；不为按钮创建 Graphics，按压支持释放与取消。
- 炼丹规则 v4：服务端提交时原子扣材料、产出丹药并写入积分事件，不等待、不另行领取；客户端仅播放整批固定 2 秒动画。旧 v1–v3 批次保留原倒计时和领取 / 退款流程。

`0.1.0` 是 P0 只读接入基线；`0.2.0` 包含资产初始化、限购商店、邮件、炼丹、英雄培养、活动冲榜、仙盟邀请、多 Boss 与对应 Cocos 页面。当前为本地验收版本，尚未审核发布。
测试资源仅在宿主进程显式设置 `GAME_DEMO_DEV_TOOLS=1` 后可领取；进入 gameDemo 时自动尝试领取，每账号每区服一次 5000 金币、经验丹 100 枚、极品丹 100 枚，并投递一封 100 金币测试邮件。旧账号仅补发两种丹药各 100 枚，不重复发金币；用掉后重新进入不会补满。幂等回执之后重新查询当前资源，不能用旧回执覆盖最新余额。
持久化生命周期与运维命令见下文；最终制品安装验收状态以实施记录为准。

活动按 10 分钟运行，结束后自动为前三名发邮件；未领取的丹药在领取时确认产出与活动计分归属。榜单通过后台流水增量更新，短暂延迟后刷新可见。结束前已提交的积分会全部消费后定榜；活动结算完成 5 秒后开启下一轮。

仙盟最多 3 人；盟主用对方在仙盟页展示的玩家 ID 发送邀请，目标账号须先初始化玩法。对方刷新后接受或拒绝；盟主离开会按加入顺序转交，最后一人离开解散。

三个 Boss 共用英雄攻击力，进入后每秒可攻击一次；同账号只选择一个房间，离开保留当局伤害。死亡按名次给所有伤害参与者发邮件，结算完成且到死亡后 60 秒才换下一局。每局最多 100 名参与者，超过时服务端明确拒绝。


宿主所需 API 版本见 `native-requires.json`，数据键和版本见 `native-data.json`。
本机多进程验收入口：`node apps/serverNew/kits/gameDemo/verify/multiprocess-live.cjs --settlement`，要求宿主既有 bearjoylivemulti 线路和数据库就绪，不能对线上服运行。
脚本使用 30 个测试账号，强杀自己启动的房间 worker，验证原局恢复、部分发信中断后离线续发与原定时间刷新；测试数据保留供审计。

## 排空与保留数据（0.2.0）

需要宿主提供 `nativeKitLifecycle@1` 和支持写入守卫的原子结构。`api/lifecycle/NativeKitMaintenance.ts` 是宿主 CLI 加载的运维入口，不是玩家 RPC。

在目标宿主 `apps/serverNew/server` 下执行 `pnpm kit:lifecycle -p <platform> -v <version> --sid <sid> --kit gameDemo --operation status|drain|resume|cancel`，每次选择一个 operation。
`drain` 立即关闭新写入，等待已开炉批次按原时间完成并领取、处理积分与奖励邮件；存活 Boss 保存原局血量/伤害并暂停，不制造击杀。已死亡 Boss 的未发邮件继续结清。该屏障作用于同一 centerRedis 下所有 SID，不只命令行传入的 SID。

排空完成后停止使用该数据库的所有服务 worker。安装器检查每个 worker 的运行租约；强杀后最多等 10 秒过期，暂停很久的旧进程醒来仍然不能写。正常停服主动释放租约。单个 kit 最多登记 128 个运行进程。

安装、升级和卸载可写 kit 前，为包工具明确设置 `NATIVE_KIT_PROFILE='{"platform":"…","version":"…","sid":1}'`，不能省略或依赖默认开发库。当前一个代码副本对应一个 centerRedis 部署；共用代码连接多个不同 centerRedis 的部署尚不支持此自动安装流程。
安装器在写文件前把宿主管理状态置为 `detached`，该状态禁止恢复和服务启动；成功生成模块后回到 `drained`，仍需显式 `resume` 才能启动业务。卸载保留 `detached` 和全部业务数据；重装重新检查数据版本、持久化 key 清单和宿主能力。

只支持相同数据版本、保留已有 key 的兼容升级；没有提供迁移程序时拒绝跨数据版本升级或删减存量 key。`--drop-data` 不支持 serverNew，`--force` 也不能绕过持久化状态校验。首次安装只登记关闭状态，不发资源或初始化玩法数据。
安装失败/回滚会保持 `detached`；修复后重新走完整安装流程。不要在生成失败后手工恢复业务。

排空默认等待 180 秒（`--timeout-ms` 可设为 1000～600000）。超时或满邮箱阻塞时保持关闭；原运维租约过期（60 秒）后可重试 drain，或显式 cancel 恢复业务，让玩家清理邮箱再排空。cancel 会使旧排空任务失效，不回滚已经合法完成的产出/发信。

真实服务生命周期测试：`node apps/serverNew/kits/gameDemo/verify/lifecycle-live.cjs`。测试会排空隔离线路已有玩法，须使用独立数据库；校验在线阻写、定时产出、在线卸载拒绝、停服后的代码替换屏障及原 Boss 局继续战斗。

## 独立原生包（0.4.0）

清单、协议向量和验收脚本归 `apps/serverNew/kits/gameDemo/`，打包使用 `npm run kit:native -- pack gameDemo --out /tmp/gameDemo-0.4.0.zip`。用 `npm run kit:native -- check gameDemo` 校验，`npm run kit:native -- test gameDemo` 运行服务端模块及随包客户端测试。
新包只携带真源；安装时生成 native 注册表并通过标准同步脚本更新客户端镜像，全程不改 `apps/server/`。0.2.x 旧试验 ZIP 不与本格式兼容。适配宿主需要 `nativeKitClient@1` 等已声明能力，不能直接安装到缺少这些扩展点的框架快照。

0.3.1 将客户端 Logic 测试及类型检查配置一并归到 `verify/client/`，卸载不在宿主测试目录留下对已卸载业务的导入。
