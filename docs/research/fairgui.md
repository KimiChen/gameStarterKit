# Fable5 FairyGUI 技术方案（设计师拿走排版/美术，结构契约 + 行为逻辑无头测）

> 目标：让**设计师在 FairyGUI 编辑器里拥有排版/美术**（`.fui` 包），同时把 **① 行为/数据逻辑 ② UI 结构契约**
> 继续**无头测掉**。方案借鉴源项目 `pyts-obfuscated-feature-porting` 已在生产验证的 FairyGUI 产线（Widget/View
> 三段式 + codegen「XML 即结构契约」），落到 Fable5 的实际栈（Cocos Creator 3.8.8 + `fairygui-cc` + 已抽好的纯 presenter）。
> 关联：[fairygui-eval.md](fairygui-eval.md)（选型/代价/3.8 集成）、[designer-ui-workflow.md](designer-ui-workflow.md)（三层测试模型）。
> 最后更新：2026-07-08

---

## 0. 一句话与结论

- **设计师**只碰 FairyGUI 编辑器（`FGUIProject/`）→ 发布 `.fui` 包；**不碰代码**。
- **代码**分两层：**presenter**（纯行为/数据，已抽好 6 个、已测）+ **View**（把 presenter 输出绑到 FGUI 组件、接事件）。
- **测试**照旧无头：presenter 单测（行为）+ **解析 `.fui`/XML 断言结构契约**（设计师改坏 code 依赖的命名元素 → 测试红）。
- **可行**：源项目就是这套（Widget/View + codegen 从 FGUI XML 生成绑定字段，且**跨引擎跑 Cocos + Unity**），我们只借模式、不引它整套框架。

> ⚠ 前置代价不变（见 [fairygui-eval.md](fairygui-eval.md) §4）：`fairygui-cc` 官方对 3.8 淡维护，需**自维一份打了社区 3.8 补丁的 fork**；FairyGUI 无官方小游戏支持声明，早测微信/字节目标。若你只想调这几个现有 UI 而非上设计师产线，[designer-ui-workflow.md](designer-ui-workflow.md) §2 的 **Cocos 原生 Prefab + Oops MVVM** 成本更低。本文档假定你已决定走 FairyGUI 产线。

---

## 1. 借鉴来源：源项目的 FairyGUI 产线（已生产验证）

源项目 `pyts-obfuscated-feature-porting`（pyts/paoyou 框架，跨 Cocos+Unity）的关键做法：

- **三段式**：`Widget`（数据/逻辑）— `View`（FGUI 绑定 + 事件）— **FGUI 组件**（视觉布局，编辑器里做）。三者一一对应（`AreaList` → `AreaListView` → FGUI `AreaList`）。
- **codegen 是核心**：`node genTs.js <PackageItemName>` 读 FGUI 组件 XML → 生成脚手架 + **`// #region AUTO FIELD DONT CHANGE` 绑定字段块**（按 `name` 前缀映射类型）。**"把 UI XML 视为 View/Component/Item 类的结构契约"**（原文）。业务逻辑写在**非生成区**；`AUTO...DONT CHANGE` 区块由 codegen 管、人不手改。
- **命名前缀绑定约定**（XML 元素 `name` ↔ TS 字段一一对应）：

  | 前缀 | TS 类型 | FGUI |
  |---|---|---|
  | `btn_*` | Button | GButton |
  | `txt_*` | Text/RichText | GTextField |
  | `ld_*` | Loader | GLoader（只有它能 `setRes`） |
  | `lst_*` | List | GList（虚拟列表 `RefreshListItem<T>`） |
  | `img_*` | Image | GImage |
  | `go_*` | GameNode | group 容器 |
  | `jb_*` | 自定义组件 | 带 JsBehaviour 的 component（类名 = XML `remark.module`，需挂 `globalThis`） |

- **反应式数据→UI**：MobX `autorun`/`reaction`/`when` 绑 Data 层 observable，View 销毁时自动释放。
- **验收靠 `git diff`**：改了 View/Component 必须 `git diff` 确认 `AUTO...DONT CHANGE` 区块没被破坏、无生成噪音——**这就是结构契约的把关点**。
- 其余：`UIMgr` 层栈管理、`R.<Comp>()` 有类型资源代理（`ui://Pkg/Comp`）、`L()` 多语言、`FGUIProject → Cocos assets` 资源同步。

---

## 2. Fable5 怎么落（借模式，不搬框架）

Fable5 **不引入 pyts 整套**（它自带引擎适配 + MobX + UIMgr + 资源同步，是另一套世界）。只搬**三个能直接用**的点，落到现有栈：

| 源项目机制 | Fable5 落点 |
|---|---|
| 运行时 | `fairygui-cc`（ccc3.0 分支 + 自维 3.8 补丁，见 fairygui-eval §3/§7） |
| Widget（数据/逻辑） | **已抽好的 6 个纯 presenter**（`ui/opponentRows.ts` 等），零重写 |
| View（FGUI 绑定/事件） | 新写薄 `FguiView` 基类 + 每界面一个绑定类（部分 codegen） |
| MobX 反应式 | **不用 MobX**：`view.apply(presenter(data))` 显式刷（Fable5 无 MobX；presenter 已纯、已测） |
| codegen genTs.js | 新写 `tools/fgui-codegen`（读 `.fui`/XML → 生成绑定字段 + 契约 fixture） |
| UIMgr | Oops `gui` LayerManager 或直接 `GRoot.inst.addChild`（见 §5） |
| R/L | Fable5 现无 i18n；`ui://Pkg/Comp` 直接用，文案暂走常量 |

---

## 3. 三层职责 + 各层测法（对齐你的要求）

| 层 | 谁负责 | Fable5 落点 | 无头测法 |
|---|---|---|---|
| **① 行为/数据** | 程序 | 纯 presenter（`opponentRows`/`lobbyRoster`/`matchResultRows`/`shopButton`/`propsChip`/`battleHudText`） | **单测**（已有 16 例）——保住 |
| **② 结构契约** | 程序定 / 设计师满足 | View 的绑定字段（codegen 从 `.fui` XML 生成） | **解析 FGUI XML 断言契约**（§4）——无头，新增 |
| **③ 视觉排版** | **设计师** | FairyGUI 编辑器 `.fui` 包 | 预览/截图/人看 |

**这正是你要的**：设计师拿走 ③（排版/美术），① 行为 + ② 结构契约都留在无头测里。② 测的不是"长得对不对"，而是"设计师产的 `.fui` 满不满足 code 依赖的命名元素契约"。

---

## 4. 结构契约怎么无头测（关键，两种做法）

FairyGUI 编辑器把每个组件存成**文本 XML**（`FGUIProject/assets/<Pkg>/<Comp>.xml`，元素带 `name`/`src`/`fileName`）。契约测 = **解析这些 XML，断言 code 依赖的命名元素都在、类型对**。不渲染，纯解析 → 无头。

**做法 A（推荐）：codegen + diff。** 写 `tools/fgui-codegen`：读 `<Comp>.xml` → 按前缀映射生成 `// #region AUTO FIELD DONT CHANGE` 绑定块（同源项目 genTs.js）。测试 = **重跑 codegen，与提交版 `git diff`**；设计师删了/改名了 code 要的 `btn_ready`/`txt_code` → 生成的字段变了 → diff 非空 → 红。顺带省手写绑定。

**做法 B：契约 lint。** 每个 View 声明 `static REQUIRED = ["btn_ready:Button","lst_roster:List",...]`；测试解析对应 `.fui` XML，断言这些命名元素存在且类型匹配。不生成代码，纯断言。

```ts
// 示意:契约 lint 测试(纯解析 XML,无头)
const comp = parseFguiComponent("FGUIProject/assets/Versus/Lobby.xml");
for (const [name, type] of LobbyView.REQUIRED) {
  const el = comp.elements.find(e => e.name === name);
  assert.ok(el, `FGUI Lobby 缺少 code 依赖的元素 ${name}`);
  assert.strictEqual(fguiType(el), type, `${name} 类型应为 ${type}`);
}
```

> 两者都不需要 `fairygui-cc` 运行时、不渲染，CI 里纯 Node 跑。**A 更省事**（绑定字段自动生成，diff 即契约把关，和源项目一致）。

**✅ 无头契约核心已落地（骨架 + 测）**：`tools/fgui-codegen/`（零依赖，`pnpm test:fgui`，6 例）——
- `parseFgui.ts`：组件 XML → displayList 直接子元素（list item/relation 等嵌套不计）；
- `binding.ts`：`bindingFields`/`emitAutoFieldBlock`（做法 A 的 codegen）+ `checkContract`（做法 B，返回 missing/mismatched）。
测试实证：解析只取直接子元素、前缀→类型映射（`jb_` 取自定义类名）、普通 group 不生成字段、设计师删元素→missing 报红、把 List 名安到 loader 上→mismatched 报红。**这段与 `fairygui-cc`/Creator 无关，已可无头 CI。** 剩运行时 `FguiView.bind/apply` 需 fairygui-cc（Creator 侧）。

---

## 5. 运行时接线（fairygui-cc on Cocos 3.8）

见 [fairygui-eval.md](fairygui-eval.md) §3 的已核实 API。Fable5 薄封装：

- **启动一次**：`fgui.GRoot.create()`（场景根需有名为 `Canvas` 的节点）；设计分辨率/Fit 在 **Cocos 项目设置**里配（FairyGUI 吃 Cocos 缩放，不另配）。
- **加载包**：`UIPackage.loadPackage("ui/Versus", onComplete)`（`.fui` 发布到 `assets/ui/`）。
- **`FguiView` 薄基类**（Fable5 自建，替代 pyts 的 View）：
  - `bind()`：按 codegen 的 AUTO FIELD，`this.btn_ready = comp.getChild("btn_ready").asButton`（codegen 生成）。
  - `apply(data)`：把 presenter 输出映射到组件（`txt.text = row.text`、`ld.setRes(...)`、List `setVirtual`+`numItems`）。
  - `onEvent`：`this.btn_ready.onClick(cb, this)`。
- **和 ECS 战斗层共存**：战斗渲染放独立 layer/相机，FGUI 在 `UI_2D` 的 Canvas 下（fairygui-eval §3/gotchas 的相机分层）。
- **入口**：`VersusRoot`/`AttackRoot` 里 `addComponent(XxxView)` → 换成 `UIPackage.createObject(...).asCom` + `view.apply(presenter(state))`；每帧/变化时 `apply`（替代现在的 `setRoster`/`setOpponents` 直接建节点）。

---

## 6. 工程结构（Fable5）

```
FGUIProject/                      # 设计师的 FairyGUI 编辑器工程(提交入库,同源项目)
  assets/Versus/*.xml             #   组件源(结构契约的事实源)
  → 发布 → apps/client/assets/ui/Versus.fui + 图集   # .fui 二进制(gitignore 或提交,见 fairygui-eval)
apps/client/assets/script/game/ui/
  opponentRows.ts ...             # ① presenter(已有,行为层,已测)
  views/OpponentHudView.ts ...    # ② View(绑定+apply+事件,部分 codegen)
  FguiView.ts                     #    薄基类(bind/apply/onEvent)
tools/fgui-codegen/               # 读 .fui/XML → 生成 AUTO FIELD + 契约 fixture
apps/client/test/
  {opponentRows,uiPresenters,uiPresenters2}.test.ts   # ① 行为测(已有 16 例)
  fguiContract.test.ts            # ② 契约测(解析 XML 断言)
```

---

## 7. 迁移路径（试点先行，presenter 已就位所以很轻）

1. **装运行时**：`fairygui-cc`（ccc3.0）vendor 进仓库 + 打社区 3.8 补丁（fairygui-eval §7）；装 FairyGUI 编辑器（mac 免费）。
2. **试点 `OpponentHud`**（最轻、presenter 已抽）：设计师在编辑器做 `OpponentHud` 组件（`txt_title`、`lst_rows` 或几行 `txt_*`）。
3. **codegen + View**：写 `FguiView` 基类 + `tools/fgui-codegen`；生成 `OpponentHudView` 绑定字段。
4. **接线**：`OpponentHudView.apply(opponentRows(opps))` 把纯数据刷到 FGUI 组件；`VersusRoot` 改挂它。
5. **契约测**：`fguiContract.test` 解析 `OpponentHud.xml` 断言 `lst_rows`/`txt_title` 在。
6. **跑通一个再铺开**其余 5 个（`LobbyView`/`MatchResultView`/`ShopBar`/`PropsBar`/`BattleHud`——presenter 全抽好了，View 只做绑定+apply，**行为零重写**）。

---

## 8. 与现有工作的衔接（为什么这套省事）

- **行为层已白送**：6 个纯 presenter（已测 16 例）就是源项目的"Widget 数据逻辑"，迁移时 View 只 `apply(presenter(...))`，**一行行为逻辑都不用重写**，也不丢测试。
- **三层模型已就位**：[designer-ui-workflow.md](designer-ui-workflow.md) 定义的三层就是本方案骨架；本文档把其中"排版层"具体化成 FairyGUI + 把"契约 lint"具体化成解析 `.fui` XML。
- **选型代价已评估**：[fairygui-eval.md](fairygui-eval.md) 已列 FairyGUI 的 3.8 淡维护 / 自维 fork / 无官方小游戏声明——那些**不因本方案改变**，是走 FairyGUI 的固定成本。

---

## 9. 取舍与风险

- **契约测依赖 FGUI XML 格式稳定**：编辑器大版本升级可能改 XML schema → codegen/lint 要跟着适配（源项目靠固定编辑器版本规避）。
- **`.fui` 二进制不可直接 diff**：契约把关放在**编辑器 XML 源**（文本，可 diff/解析），不是发布出的 `.fui` 二进制；所以 `FGUIProject/assets/*.xml` **必须提交入库**（同源项目"已提交 UI 作为事实源"规则）。
- **颜色/文案**：源项目强制走统一 `color.ts` + `L()`；Fable5 现在颜色在 presenter 里（`Rgba` 常量），迁移时保持"颜色/文案在 presenter，View 只搬运"，避免散落到 FGUI 里难测。
- **vs Cocos 原生 Prefab**：若只为"调好看这几个 UI"，Prefab+Oops MVVM 更省（designer-ui-workflow §2）；FairyGUI 的净收益在**设计师专业产线 + 复杂动效 + 源项目已验证的同一套工作流**。

---

## 10. 来源

- 源项目文档：`pyts-obfuscated-feature-porting/references/game-dev-docs/`：`01-architecture/index.md`（三段式 + 工程关系）、`02-develop/01-ui/{index,ui-binding-rules,best-practices}.md`（Widget/View、命名前缀、"XML 即结构契约"、codegen genTs.js、MobX）、`03-framework/03-ui.md`（View/Widget/UIMgr API）、`project-specific-rules.md`（AUTO 区块 git diff 验收、已提交 UI 作事实源）。
- Fable5：`docs/research/fairygui-eval.md`、`docs/research/designer-ui-workflow.md`、`apps/client/assets/script/game/ui/*.ts`（6 presenter + 视图）、`apps/client/test/{opponentRows,uiPresenters,uiPresenters2}.test.ts`。
