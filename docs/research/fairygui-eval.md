# FairyGUI 选型调研（对战 UI / 视觉布局打磨）

> 目的：评估用 **FairyGUI** 做 Fable5 的对战 UI（P4 视觉/布局打磨）是否合适、怎么接、代价多大。
> 结论先行：**就"对战这几个 UI"而言，FairyGUI 大概率是净负收益（成本高、无忠实度收益、丢无头测试）；
> 但若你的真实目标是"整套游戏 UI 长期改版 + 引入设计师可视化产线"，FairyGUI 是一个免费、架构良好的正经选择——
> 前提是接受你要自己维护一个 3.8 的 fork。** 详见 §1 决策、§6 三方案对比。
> 结论基于多源核实（官方 repo/文档 + npm + GitHub API + Cocos 论坛 + 本地原版工程扫描），来源见 §8。
> 最后更新：2026-07-08

---

## 1. 决策速览

| 你的真实意图 | 建议 |
|---|---|
| **只想把现有对战几个 UI 排版调好看** | **不建议上 FairyGUI**。用 Cocos 原生 Prefab（+ 你已有但没用的 Oops `gui` 窗口管理器）做可视化排版，成本最低、留在单一引擎、无 fork 维护、无额外产线。见 §6。 |
| **要做一整套复杂 UI + 有/要请 UI 设计师走可视化产线** | **可以上 FairyGUI**。它在"设计师产线 / 复杂布局动画 / 列表虚拟化 / 多状态控制器"上强于手写和 Cocos 原生 Prefab。但要预算：自己 fork + 打 3.8 补丁、丢无头 UI 测试。见 §5/§7。 |
| **想复用原版 UI 资产省事** | **此路不通**。原版是 LayaAir 原生 UI（`.lh`/`.ls`），**不是** FairyGUI，没有 `.fui` 包可复用。见 §2。 |

**一句话**：FairyGUI 本身是好东西（免费、成熟、设计师友好），但它的最大杀手锏——"跨引擎复用 UI 资产 / 设计师产线"——在**当前这批只有 462 行、且已被无头测试覆盖的代码化对战 UI** 上用不上，反而会把已有的确定性测试和轻依赖架构换成一个需要自己维护的外部产线。

---

## 2. 关键发现：原版不是 FairyGUI（无忠实度收益）

对忠实还原类项目，FairyGUI 通常最强的理由是"原版就用 FairyGUI，直接把 `.fui` 包导进来"。**本项目不成立**：

- 扫遍反编译原版 `/Users/edwin/Downloads/layaProj_new`（含 library/local/packages/bin）：**零个 `.fui`/`.fairy`**，游戏代码里**零个** `fairygui`/`UIPackage`/`GComponent` 引用。唯一的 "fairygui" 字样只在 LayaAir 引擎自带的 `.d.ts` 类型声明里（引擎支持声明，从未 import）。
- 原版 UI = **LayaAir 原生**：`assets/dialog/*.lh`（16 个 Dialog 布局，JSON 场景图）+ `.ls` 场景 + `.atlas` 图集；运行时 `src/game/ui/*.js` 是 Laya.UI/Sprite 派生类（`BaseDialog`/`UiViewBase`/`ScrollListComponent`…）。
- **可复用的只有**：原始美术/图集/Spine/音频/数值。`.lh`/`.ls` 布局文件**只能当排版参考规格**，不能导进 FairyGUI。

> 换言之：无论选哪套 UI 方案，你都得**照着原版 `.lh` 重新搭一遍**。这把"FairyGUI 省事"的前提抽掉了——搭建工作量三方案都存在，区别只在"在哪搭、搭完好不好测/好不好维护"。

---

## 3. FairyGUI 是什么 + 3.8 集成（已核实）

- **免费 & 开源**：运行时 `FairyGUI-cocoscreator`（MIT）+ 独立 **FairyGUI 编辑器**（Win/mac 免费、可商用、零版税）。
- **支持 Cocos 3.8**：用 `ccc3.0` 分支（README 契约"CocosCreator 3.4 以上"，覆盖 3.8.8）。npm 包 `fairygui-cc`（1.2.2，2024-05）或直接拖 `bin/fairygui.js`+`.d.ts`。⚠ **别用** `ccc3.0-3.4` 分支（上限 3.4）。
- **接法干净，能和你现有架构共存**（源码核实）：
  - `import * as fgui from "fairygui-cc"`；启动一次 `fgui.GRoot.create()` → 它把 GRoot 挂到场景里名为 **`Canvas`** 的节点下。
  - 每个 FairyGUI 元素 `GObject` **本质就是一个 Cocos `Node`**（`gobj.node` ↔ `node.$gobj`），在标准 `UI_2D` 层，**和你的代码化节点 / ECS 战斗渲染层同场景共存**——z 序就是 Cocos 兄弟节点顺序，输入走挂在 GRoot 上的 `InputProcessor`。战斗层放独立 layer/相机即可分离。
  - **分辨率自适应直接吃 Cocos 的**：FairyGUI 3.x **没有**自己的缩放模式，`UIContentScaler` 用 `screen.windowSize / view.getScaleX/Y()` 推 GRoot 尺寸——设计分辨率/Fit 模式在 **Cocos 项目设置**里配，两套不打架。（⚠ 别用 `Director.setContentScaleFactor`，会破 FairyGUI 布局。）
  - 加载：`UIPackage.loadPackage(path, onComplete)`（异步，推荐）；创建：`UIPackage.createObject(pkg, res).asCom` → `GRoot.inst.addChild(view)`。
  - 代码绑定：`getChild(name)` / `getController(name)`（多状态页）/ 自定义组件 `extends GComponent` + `UIObjectFactory.setExtension(url, Class)`；事件 `obj.onClick(cb, target)`；**列表虚拟化** `GList.setVirtual()` + `itemRenderer`/`numItems`；布局锚定用 `addRelation(...)` / gears。
- **编辑器产出**：二进制包（`包名.bin` 描述符 + 图集 PNG）放进 `assets` 运行时加载。图片导入类型要设 **RAW/BufferAsset**（常见"图不显示"坑）。

**FairyGUI 强在哪**：可视化 WYSIWYG 排版、控制器（多状态）、关系/gears（锚定+按状态动画）、虚拟列表、设计师-程序解耦产线。做**复杂、多屏、重动效**的 UI 明显强于手搓。

---

## 4. 代价与坑（3.8 尤其注意）

- **官方 Cocos 绑定维护很淡**：无 Release/Tag，`ccc3.0` 最后提交 **2024-05-21**，~13–20 个 open issue（含 3.8.5 的 `#97 GLoader+fill`、3.8.3 的 `#90 位图字体`）**无维护者回复**。社区共识原话："fgui 官方是指望不上了，自己动手丰衣足食"。
- **3.8 开箱有实打实的破**：mask 渲染 + 文本输入偏移、无扩展名 GLoader、ScrollPane 包围盒、位图字体、Loader 当进度条——社区 3.8 补丁（Cocos 论坛 topic 153699）**基本是必读/必打**。→ **你实际上要 vendor 一份源码、自己维护 fork。**
- **丢无头 UI 测试**：你现在 `test/cc-shim.ts`+`ui-run.test.ts` 能在 Node 里真跑 `LobbyView/MatchResultView/OpponentHud`（建树、断言 `Label.string`、触发点击）。FairyGUI 视图是外部编辑器产的 `.fui` 二进制 + 运行时加载，**没法这样无头 shim**——这几个视图会退回"仅编辑器手验"。
- **小游戏（微信/字节）**：FairyGUI 无官方小游戏支持声明，靠 Cocos 构建管线 + 社区补丁；纹理/图集内存、分包懒加载、文本渲染是常见坑，**要早测真机小游戏目标**。
- **批处理**：FairyGUI 用自己的深度调整批处理（非 Cocos 原生自动合批/动态图集）；美术不合图集会掉帧，和 Cocos 原生 UI 混用更复杂。
- **多一条产线**：独立 FairyGUI 编辑器 App + `.fui` 导出步骤 + 设计师培训。

---

## 5. 落到本项目的迁移成本

- 现状：`apps/client/assets/script/game/ui/` 11 个**纯代码化**视图（只 import `cc`），对战 6 个视图 = **462 行**（`LobbyView` 83 / `MatchResultView` 51 / `OpponentHud` 70 / `BattleHud` 51 / `ShopBar` 83 / `PropsBar` 124）。命令式挂载（`VersusRoot`/`AttackRoot` 里 `addComponent` + 接回调），**没用** Oops `gui`（只有 `BattleHud`/`ShopBar` 碰 Oops 的 `ecs` 单例，与 UI 渲染无关）。
- 上 FairyGUI 每个视图要：(a) 在编辑器里**从零搭 `.fui`**（原版无 FairyGUI 资产可导）；(b) `.ts` 从"代码建节点"改写成 FairyGUI GComponent 绑定；(c) 重接命令式回调（`onReady`/`onLocalRefresh`/`onLocalCast`/`armProp` + `update()` 里的 roster/afford 刷新）。最重的是 `PropsBar`（124 行、每格冷却 Graphics 遮罩）和 `ShopBar`（买得起状态重绘）。
- **净账**：重写 ~462 行 + 新做 6 个 `.fui` 包 + 丢 `ui-run.test` 覆盖，**换来零忠实度收益**（原版无 FairyGUI 资产）。对"只把这几个 UI 调好看"来说不划算。

---

## 6. 三方案对比

| 维度 | A. 现状：纯代码化 | B. Cocos 原生 Prefab（+ Oops `gui`） | C. FairyGUI |
|---|---|---|---|
| 可视化排版 | ✗（手写坐标） | ✓（Creator 编辑器内所见即所得） | ✓✓（专业 UI 编辑器，控制器/gears/虚拟列表） |
| 额外工具链 | 无 | 无（就是 Creator 本身） | **有**（独立编辑器 + `.fui` 导出 + 设计师产线） |
| 引擎内单一栈 | ✓ | ✓ | ✗（外部 + 需 fork 3.8 补丁） |
| 无头测试 | ✓（cc-shim 已覆盖） | 半（Prefab 结构难在 Node 里跑，逻辑可拆测） | ✗（基本没法无头） |
| 设计师-程序解耦 | 弱 | 中 | 强 |
| 复杂/重动效 UI | 累 | 中 | 强 |
| 复用原版资产 | 照 `.lh` 重搭 | 照 `.lh` 重搭 | 照 `.lh` 重搭（且无 `.fui` 可导） |
| 维护负担 | 低 | 低 | **高**（官方淡维护，自维 fork） |

> **B（Cocos 原生 Prefab + 你已有的 Oops `gui` LayerManager）常被忽略，但很可能是"视觉/布局打磨"的甜点**：可视化排版、留在单一引擎、零 fork、且 Oops 已提供基于 Prefab 的分层窗口管理器（`core/gui/layer/LayerManager`，你现在完全没用）。它把"手写坐标累"和"FairyGUI 那套外部产线重"两头的缺点都避开。

---

## 7. 如果你仍决定上 FairyGUI（落地路径）

1. **装运行时**：取 `ccc3.0` 分支的 `bin/fairygui.js`+`fairygui.d.ts` **vendor 进仓库**（别只依赖 npm `fairygui-cc` 1.2.2，它 2024-05 后没更新）；或 `pnpm add fairygui-cc` 但准备好覆盖补丁。**先打社区 3.8 补丁**（论坛 topic 153699：mask/输入偏移/GLoader/ScrollPane/位图字体）。
2. **装编辑器**（mac 免费）→ 新建 Cocos 目标的 UI 工程 → 图片导入设 **RAW/BufferAsset** → 发布二进制包到 `assets/`。
3. **接线**：场景根确保有名为 `Canvas` 的节点 → 启动调一次 `fgui.GRoot.create()` → 设计分辨率/Fit 在 **Cocos 项目设置**里配 → 战斗 ECS 渲染层放独立 layer/相机与 UI_2D 分离。
4. **视图**：每个对战视图做成一个 FairyGUI 组件包，`extends GComponent` + `UIObjectFactory.setExtension`；把 `VersusRoot`/`AttackRoot` 里的 `addComponent(XxxView)` 换成 `UIPackage.createObject(...).asCom` + 回调改绑 `getChild`/`getController`。
5. **验收**：无头测试会丢——补一层"纯逻辑可测 + 编辑器手验"；**早测微信/字节小游戏目标**（纹理内存/分包/文本）。
6. **先切一个试点**（建议 `OpponentHud` 或 `MatchResultView`，最轻），跑通产线再决定要不要铺开。

---

## 8. 来源

- 官方绑定：https://github.com/fairygui/FairyGUI-cocoscreator （`ccc3.0` README、branches、commits API）
- npm：https://registry.npmjs.org/fairygui-cc ・ 文档：https://www.fairygui.com/docs/sdk/creator ・ 发布设置：https://www.fairygui.com/docs/editor/publish
- 编辑器：https://www.fairygui.com/download ・ https://github.com/fairygui/FairyGUI-Editor
- 维护/issue 健康：https://github.com/fairygui/FairyGUI-cocoscreator/issues （#86 3.8 mask 已修、#97 3.8.5 GLoader、#90 3.8.3 位图字体）
- 社区 3.8 适配补丁：https://forum.cocos.org/t/topic/153699
- Cocos 3.8 小游戏构建：https://docs.cocos.com/creator/3.8/manual/en/editor/publish/publish-wechatgame.html
- 本地：原版 `/Users/edwin/Downloads/layaProj_new/assets/dialog/*.lh`（Laya 原生 UI，无 FairyGUI）；本项目 `apps/client/assets/script/game/ui/*.ts`、`apps/client/test/{cc-shim,ui-run.test}.ts`、Oops `extensions/oops-plugin-framework/assets/core/gui/`
