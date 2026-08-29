# gameplay/ —— 玩法组合边界

`gameplay/` 是客户端玩法的应用组合层。这里把每个玩法的 Logic、房间适配器和可选的 Cocos
presentation 绑定到同一个 `GameplayRegistry` 登记；默认登记入口是 `catalog.ts`。

## 依赖方向

- 玩法规则与状态行为放在 `../logic/rooms/<mode>/`，保持引擎无关并可在 Node 中测试。
- 房间连接放在 `../net/rooms/<Mode>Room.ts`，只适配通用 `RoomClient`/`GameRoomTransport` 提供的
  ownership 和生命周期能力。
- 需要节点或 FairyGUI 的展示适配放在 `../view/`，通过 `GameplayPresentationHost` 注入宿主；本目录
  不直接操作节点，也不把具体 View 暴露给 `Main`。
- `catalog.ts` 可以静态 import Logic 与 room joiner；具体 presentation 必须由对应登记项按需
  `import()`，避免 FairyGUI 进入启动脚本的静态依赖图。

## 新增玩法

1. 在 `apps/shared/src` 登记 canonical mode id、state manifest root 与玩法消息，运行 state codegen 和
   `npm run sync:shared`。
2. 增加对应的 `logic/rooms/<mode>/` 与 `net/rooms/<Mode>Room.ts`，定义 raw state exact validator、
   C2S allowlist 和可选 reconcile，沿用通用 transport 的 join/leave 与取消语义。
3. 在 `catalog.ts` 注册 factory、joiner 和可选 presentation factory。无 UI 的玩法省略
   presentation，不应创建其他玩法的 View。
4. 运行 `npm run sync:client`，再执行 `npm run typecheck:client`、
   `npm run typecheck:client:legacy`、`npm run test:client` 与 `npm run test:fgui`；在 Cocos
   编辑器中补做真实资源和生命周期预览。

新增玩法不得修改通用 `RoomClient`、`RoomController`、`GameRoom` 或 `Main` 的启动流程来塞入玩法特例。
跨端 mode、房间状态和 wire 字段必须先更新 shared 契约，并为注册、隔离、启动失败和 dispose 路径补测试。

## 当前登记

- `ballMove`：带 `BallMoveView` 的演示玩法；presentation 只在该 entry 启动时动态加载。
- `idle`：无 presentation、独立 `IdleRoomState` 与 pulse 输入/结算的最小第二 mode，不代表完整玩法 UI。

目录本身不是玩法规则的真源；修改规则请回到 `logic/rooms/`，修改共享协议请回到 `apps/shared/src`。
