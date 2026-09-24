# gameDemo 插件

新框架（serverNew）标准开发方式的验证样例，按 heroRecruit 同一条动线实现：

`apps/shared/schema/protocols/C2S/gameDemo.json` → `pnpm gen:kit-protocol` → `pnpm generate` →
`apps/serverNew/server/src/modules/gameDemo/action/Action*.ts` → `bean/` 上的 Bean 字段。

- 数值与公式只在 `apps/shared/src/protocol/lobbyRpc/checks/gameDemo.ts` 维护，客户端只用于展示与预判。
- 金币就是宿主 `User.copper`；材料、丹药、英雄、商店限购、炼丹批次与邮箱在玩家 Bean `GameDemoPlayer`。
- 活动、仙盟、Boss 是共享资源，Action 声明各自的 `taskGroupId` / `bindId`，在 Task Worker 串行写入 `ServerHash` Bean；
  部署多进程时必须配置 Task Worker 池。
- 跨实体写入走可靠队列：炼丹积分投递到活动，活动 / Boss 奖励投递到收件人的玩家 Owner，均以业务来源作幂等号。
- Boss 房间变化由框架按房内在线参与者推送 sync 帧，客户端收到更新后刷新，没有自定义推送。
- 客户端入口打开全屏 `GameDemo` 页，使用标准 `lobbyRpc` 端口；测试资源需宿主进程设置 `GAME_DEMO_DEV_TOOLS=1`。
