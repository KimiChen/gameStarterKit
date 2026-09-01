# gameplay/ —— 玩法组合边界

`gameplay/` 是客户端玩法的应用组合层。每个玩法拥有一个 `modes/<id>/index.ts` 模块
（`createGameplayModule(services)` → §7.6 `GameplayModule`：validateLaunch + joiner +
createPlugin），由生成的 `catalog.generated.ts`（`registerGeneratedGameplays`）静态字面量
聚合登记；`services.ts` 是注入给全部模块的稳定服务面（`GameplayServicesContext`），
`catalog.ts` 只是废弃的零状态转发 façade。

## 依赖方向

- 玩法规则与状态行为放在 `../logic/rooms/<mode>/`，保持引擎无关并可在 Node 中测试。
- 房间连接放在 `../net/rooms/<Mode>Room.ts`，只适配通用 `RoomClient`/`GameRoomTransport` 提供的
  ownership 和生命周期能力。
- 需要节点或 FairyGUI 的展示适配放在 `../view/`，经 `GameplayServicesContext.presentationHost`
  取得挂载节点、经 generation-fenced `GameplayInstanceHost`（§7.7）回流输入；本目录不直接操作
  节点，也不把具体 View 暴露给 `Main`。
- module 可以静态 import Logic 与 room joiner；具体 presentation 必须按需**字面量动态
  `import()`**（铁律 10），避免 FairyGUI 进入启动脚本的静态依赖图——`generated-purity` 门禁
  覆盖本目录全部文件（禁 cc/fairygui-cc/db:// 值导入）。

## 新增玩法

1. 在 `apps/shared/schema/gameplays/<id>/` 增加 manifest/state 单源目录（需要 wire 时加
   `apps/shared/src/gameplays/<id>/wire.ts`），并在 `apps/shared/src/protocol/rooms.ts` 的
   `GameplayModeId` 登记 canonical id；运行
   `npm --workspace @game/server run codegen:gameplays` 与 `npm run sync:shared`。
2. 增加对应的 `logic/rooms/<mode>/` 与 `net/rooms/<Mode>Room.ts`，定义 raw state exact validator、
   C2S allowlist 和可选 reconcile，沿用通用 transport 的 join/leave 与取消语义。
3. 新增 `gameplay/modes/<id>/index.ts` 导出 `createGameplayModule(services)`（生成器语法级校验
   该导出）；重新运行 `codegen:gameplays` 让 `catalog.generated.ts` 收录。无 UI 的玩法省略
   presentation，不应创建其他玩法的 View。⛔ 不修改 `Main` / `RoomClient` / `pages` / `Home` /
   本目录的手写文件。
4. 运行 `npm run sync:client`，再执行 `npm run typecheck:client`、
   `npm run typecheck:client:legacy`、`npm run test:client` 与 `npm run test:fgui`；在 Cocos
   编辑器中补做真实资源和生命周期预览。

新增玩法不得修改通用 `RoomClient`、`RoomController`、`GameRoom` 或 `Main` 的启动流程来塞入玩法特例。
跨端 mode、房间状态和 wire 字段必须先更新 shared 契约，并为注册、隔离、启动失败和 dispose 路径补测试。

## 当前登记

- `ballMove`：带 `BallMoveView` 的演示玩法；presentation 只在该 entry 启动时动态加载。
- `idle`：无 presentation、独立 `IdleRoomState` 与 pulse 输入/结算的最小第二 mode，不代表完整玩法 UI。
- `privateFixture`（仅 catalog）：私房验收 fixture gameplay——走完整单源链但 ⛔ 无客户端 module、
  不进生产 mode registry。

目录本身不是玩法规则的真源；修改规则请回到 `logic/rooms/`，修改共享协议请回到 `apps/shared/src`。
