# logic/ —— 逻辑层

⛔ 全目录禁止 import `cc` / `fairygui-cc`（`apps/client/test/logic-purity.test.ts` 机检）。本目录纳入
客户端严格类型检查，代码可在无引擎环境测试；这不表示每个 Logic 已有完整行为用例。

- `page/`：UI 页面行为，`XxxLogic.ts` ↔ `view/XxxView.ts` 同名配对
- `areaDirectory.ts`：区服目录的展示/准入判定（维护态与 openTime 闸）；真正的进服准入仍由游戏服 onAuth 决定
- `rooms/<玩法>/`：实时玩法域，对应服务端 `rooms/`；`ballMove/` 是 demo 玩法（小球移动）的域名，
  fork 本仓后按真实玩法改名/新增（如 `rooms/fishing/`）
- 只放 UI 行为与玩法模拟；双端共享公式在 `shared/logic/`，引擎渲染适配在 `view/`
- 异步结果必须在关闭/换页后可失效；Node strict/lifecycle tests 已覆盖当前页面接缝，真实 Creator 引擎
  的资源导入和交互仍需编辑器预览，边界与后续限制见根 `plan-v3.md`
