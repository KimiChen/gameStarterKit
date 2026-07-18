# logic/ —— 逻辑层

⛔ 全目录禁止 import `cc` / `fairygui-cc`（`apps/client/test/logic-purity.test.ts` 机检）——全部无头可测。

- `page/`：UI 页面行为，`XxxLogic.ts` ↔ `view/XxxView.ts` 同名配对
- `rooms/<玩法>/`：实时玩法域，对应服务端 `rooms/`；`ballMove/` 是 demo 玩法（小球移动）的域名，
  fork 本 kit 后按真实玩法改名/新增（如 `rooms/fishing/`）
- 只放 UI 行为与玩法模拟；双端共享公式在 `shared/logic/`，渲染在 `view/` 与 Main.ts
