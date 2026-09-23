# gameDemo 原生模块

入口 `GameDemoModule.ts` 由宿主生成器收录，包所有权限定在本模块与对应测试目录。
协议来自 shared 编译产物，客户端身份由宿主原生大厅验证。
Redis 操作只使用引擎导出的数据结构；跨实体写入使用 AtomicHashTransaction，业务回执使用 AtomicOperation，不访问原始 client。
金币与道具只通过 NativeLobbyAssets 复用宿主权威；金额、业务终态和回执必须在同次事务提交，回复 sync 在提交后登记。
重试返回持久化的首次结果，之后的当前状态应通过只读查询获取；不能拿首次结果重新累加 UI 余额。

初始丹药通过账号记录的可选 starterPillsGranted 标记兼容旧数据；标记与两种道具增量同事务提交，不能根据余额为零补发。只读 snapshot 不发奖励，自动领取由客户端进入页面时调用原有 initialize 写接口。

炼丹规则 v4 在 start 的同一原子事务中扣材料、产出丹药、记录积分事件与幂等回执；返回 claimed 批次，durationMs=0、endsAt=startedAt。客户端整批 animationMs=2000 仅作表现，不触发领取 RPC。v1–v3 持久批次继续用原 durationMs / endsAt 计时，支持旧领取与未完成材料退款，不能重算。

房间战斗时钟使用事务内 Redis 时间；生命值、死亡截止时间、自动攻击意愿与伤害回执同事务保存。恢复时每个参与者至多结算一个到期动作，不追补离线期间的密集攻击；不要用进入房间或 owner 切换重置已有生命状态。

房间 Action 在配置 Task Worker 池时必须显式返回与房间归属相同的 taskGroupId；bindId 只负责目标进程内串行，不能用它选择进程。调整宿主路由时同步检查后台 tick 与玩家请求是否到达同一房间 Owner。
