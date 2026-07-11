# FairyGUI 启用 + 第一个 .fui 上手指南（Phase A 试点）

> 目标：在 Cocos Creator 里把 `fairygui-cc` 跑起来 + 让设计师产出第一个 `OpponentHud.fui`，然后交给我
> 生成 View + 接线 + 契约测。按顺序做，每步都有"怎么验证成功"。关联 [ui-migration-plan.md](ui-migration-plan.md)、[fairgui.md](fairgui.md)。

---

## A. 装 fairygui-cc 运行时（Creator 侧，约 10 分钟）

### A1. 拉运行时文件
仓库根目录跑：
```bash
pnpm fetch:fgui
```
成功后会有 `apps/client/extensions/fairygui-cc/runtime/fairygui.mjs`（600K+）和 `fairygui.d.ts`。
（外壳 `package.json`/`browser.js` 已提交入库；运行时是 gitignore 的，每台机跑一次这条。）

**验证**：`ls apps/client/extensions/fairygui-cc/runtime/` 有 `fairygui.mjs` + `fairygui.d.ts`。

### A2. 让 Creator 挂载扩展
1. 打开/重启 Cocos Creator（打开 `apps/client` 工程）。
2. 顶部菜单 **扩展 → 扩展管理器**（Extension Manager），在**项目**页应能看到 `fairygui-cc`，**启用**它。
3. 重启一次 Creator 让它挂载。

**验证**：资源管理器（Assets 面板）里出现只读的 `db://fairygui-cc`，下面有 `fairygui.mjs`。
若没出现：确认 `apps/client/extensions/fairygui-cc/package.json` 存在（`contributions.asset-db.mount` 指向 `./runtime`），再重启。

### A3.（可选，但 3.8 建议）打社区补丁
stock `fairygui.mjs` 在 3.8 有已知问题（mask/文本输入偏移/GLoader/位图字体）。**第一次冒烟可先不打**；
若后面渲染/输入不对，参照 Cocos 论坛 topic 153699 的 3.8 补丁改 `fairygui.mjs`（见 [fairygui-eval.md](fairygui-eval.md) §4）。
纯文本的 `OpponentHud` 一般用不到这些补丁。

### A4. 启动 GRoot（✅ 已接线，无需你改）
`Main.ts` 已加好 FairyGUI 启动（`setupFairyGUI()`）。**不用官方 `GRoot.create()`**——它硬编码找场景直接子
节点名 `Canvas`，Fable5 的 Canvas 未必在那 → 会 `null.addChild` 崩（就是你遇到的报错）。已改为**自动找场景里
Canvas 组件所在节点**挂 GRoot，规避这坑、且幂等。

**验证**：Creator 重新编译后运行预览，控制台**不再**有 `Cannot read properties of null (reading 'addChild')`
或 `Call GRoot.create first`。（只要场景里有一个带 Canvas 组件的节点即可，Fable5 主场景已有。）

---

## B. 装 FairyGUI 编辑器 + 打开工程（约 5 分钟）

> **`FGUIProject/` 已生成入库**（格式照官方 demo 逐文件核对过）：CocosCreator 目标、设计分辨率 750×1624、
> 发布路径 `../apps/client/assets/resources/ui`、`Versus` 包内含试点组件 `OpponentHud`（`txt_title`+`txt_body`）。
> **不用新建工程**，装好编辑器直接打开。

### B1. 下载编辑器
https://www.fairygui.com/download —— mac 版，免费。装好打开。

### B2. 打开已生成的工程
编辑器里 **打开项目** → 选仓库里的 `FGUIProject/Fable5UI.fairy`。
✅ 验证：资源库能看到 `Versus` 包，双击 `OpponentHud` 能打开（两个文本元素 `txt_title`/`txt_body`）。
设计师此后在这里调排版/美术；**元素命名别改**（命名=契约，改了 CI 契约测会红）。

### B3. 设发布路径 → Cocos 的 **resources**（关键）
项目发布设置里，**发布路径指到** `apps/client/assets/resources/ui/`。包名用 **`Versus`**。
⚠ 必须在 `resources/` 下：`UIPackage.loadPackage("ui/Versus")` 无 bundle 参数时**固定走 resources bundle**
（fairygui 源码 `bundle = bundle || resources`），发布到 `assets/ui/` 运行时会找不到包。
发布后**先开一次 Cocos Creator** 让它给新文件生成 `.meta`，把发布产物（`Versus.bin`/图集）和 `.meta` 一起提交。

---

## C. 发布 `OpponentHud`（约 2 分钟）

> 组件已生成好（最简试点：`txt_title` 静态标题 + `txt_body` 多行正文，导出已勾）。只差**发布**——
> `.bin` 二进制只能由编辑器产出，这步必须在编辑器里做。

1. 打开工程后直接 **发布**（Cmd+B 或工具栏发布按钮）。
2. ✅ 验证：`apps/client/assets/resources/ui/` 出现 `Versus.bin`（或 `Versus_fui.bytes` 命名，视编辑器版本）。
3. **开一次 Cocos Creator** 让它给新文件生成 `.meta`，把发布产物 + `.meta` 一起提交。
4. （设计师后续想调样式：改字号/颜色/位置随意；**别改元素命名**。）

**验证（冒烟，可选但推荐）**：在 Creator 里临时写个脚本，确认能加载并显示：
```ts
import * as fgui from "db://fairygui-cc/fairygui.mjs";
fgui.UIPackage.loadPackage("ui/Versus", (err: unknown) => {
  if (err) { console.error("FGUI 包加载失败", err); return; }
  const view = fgui.UIPackage.createObject("Versus", "OpponentHud").asCom;
  fgui.GRoot.inst.addChild(view);
  console.log("✅ OpponentHud 显示成功");
});
```
预览能看到 "对手战况" 标题 = 运行时通了。

---

## D. 代码侧（✅ 已完成）

组件 XML 既已生成，View/契约那套已同步做完：
- `ui/fgui/OpponentHudView.ts`：codegen scaffold（AUTO FIELD/BIND）+ `apply(opponentRows(opps))`（复用已测 presenter，行为零重写）+ `make()` 便捷创建。
- `ui/fguiContracts.ts`：纯契约清单（代码依赖哪些命名元素的**提交版事实源**，View 与测试共用）。
- `test/fguiContract.test.ts`：无头契约测——解析 `FGUIProject/assets/Versus/OpponentHud.xml` 跑 `checkContract` + 断言包内导出。设计师改坏命名 → CI 红。
- `FguiView.create`：已加“包已加载则直接复用”（防重复 loadPackage 泄漏）。

**剩最后一步（B/C 做完后）**：Creator 里冒烟——临时把下面贴进任意启动脚本跑一次预览：
```ts
import { OpponentHudView } from "./game/ui/fgui/OpponentHudView";
void OpponentHudView.make().then((v) => {
  v.mountTo();
  v.apply([{ name: "测试对手", round: 3, hearts: 7, alive: true }]);
  console.log("✅ FGUI OpponentHud 渲染成功");
});
```
预览看到“对手战况 / 测试对手：第 3 波 · 剩 7 血” = **Phase A 管线全通**；之后我再把 `VersusRoot` 的对手 HUD 正式换成它（经 Main 注入 seam，避免破无头 typecheck），并流水线复制其余 5 个视图。

---

## 常见卡点

- **`db://fairygui-cc` 不出现**：扩展没启用/没重启 → A2。外壳 `package.json` 缺失 → 确认它在（已入库）。
- **`import ... fairygui.mjs` 报红/找不到**：这是**无头 typecheck 排除**的正常现象；Creator 自带 tsconfig（真 cc）能解析。运行时以 Creator 预览为准。
- **`Call GRoot.create first!`**：A4 的 `GRoot.create()` 没加或没在 Canvas 就绪后调。
- **图不显示**：FairyGUI 编辑器里图片导入类型要设 **RAW/BufferAsset**（fairygui-eval §5 gotchas）。
- **3.8 渲染怪**（mask/输入偏移）：打 A3 的社区补丁。
