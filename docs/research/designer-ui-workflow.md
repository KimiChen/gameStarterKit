# 让设计师参与 UI 编辑，同时保住"无头测试"

> 问题：现在 UI 全代码化（`new Node()`），设计师改不了；但代码化换来了无头 UI 测试（cc-shim/ui-run）。
> 上可视化编辑（Cocos Prefab / FairyGUI）设计师能改了，但"无头测 UI"就没了。怎么两头都要？
> 关联：[fairygui-eval.md](fairygui-eval.md)。

---

## 0. 先纠一个错觉：你的"无头 UI 测试"从来没在测"好不好看"

看清楚 `test/ui-run.test.ts` 到底测了啥：它建节点树、断言 `Label.string`、`emit(TOUCH_END)` 后看回调有没有触发。**它测的是"结构 + 行为"（数据有没有正确显示、点击有没有正确响应），不是"排版美不美"。** 美观从来都得靠眼睛（预览/截图/人看）——任何方案都一样。

所以目标不是"保住无头测美观"（它本就不存在），而是：**让设计师拿走"排版/美术"，同时把"结构契约 + 行为逻辑"继续无头测掉。** 这是能做到的。

---

## 1. 三层分离：每层各自的验证方式

把一个界面拆成三层，各测各的：

| 层 | 谁负责 | 放哪 | 怎么验证 |
|---|---|---|---|
| **行为/数据** | 程序 | 纯 TS（控制器 / VM setter） | **无头单测**（喂数据→断言输出；点击→断言意图）——保住 |
| **绑定契约** | 程序定、设计师满足 | 编辑器里的命名节点 / VM 绑定 / 事件名 | **把资产当数据解析后断言**（parse `.prefab` JSON / FairyGUI `.xml`，断言"叫 readyBtn 的按钮在""绑到 `versus.myRound` 的 Label 在"）——无头，**新增的一种测试** |
| **视觉排版** | 设计师 | 可视化编辑器（Prefab/FairyGUI） | **眼睛**：Cocos 预览 + 截图 + 视觉回归 diff——半自动，本就该视觉验 |

关键洞察：**你不无头测"长得对不对"（那要渲染），你无头测"设计师产的资产满不满足代码要的契约" + "行为逻辑对不对"。** 前者防"设计师把代码要的按钮改名/删了"，后者防逻辑 bug；美观交给截图/人。

---

## 2. 你的甜点方案：Cocos Prefab + Oops MVVM（框架已自带，你没用）

Oops 自带完整 **MVVM 数据绑定**（`libs/model-view/`：`VM-Label`/`VM-Progress`/`VM-State`/`VM-Event`/`VM-Custom`…），这正是"设计师改排版、程序管数据、两边解耦"的现成工具：

**设计师侧（Cocos Creator 编辑器内，零代码）：**
- 可视化搭 Prefab（拖节点、调排版、上美术）。
- 给要动的节点挂 Oops 的 VM 组件、填 `watchPath`：给血量 Label 挂 `VM-Label`、`watchPath = "versus.myHearts"`；给"准备"按钮挂 `VM-Event`、绑处理函数名 `onReady`；多状态（大厅/倒计时/结算）用 `VM-State` 按一个 path 切显隐。

**程序侧（纯数据，可单测）：**
- 视图逻辑退化成"往 VM 塞数据"：`VM.setValue("versus.myHearts", prog.allyHearts)`。**不碰任何布局/节点**。
- 于是 `VersusRoot`/`AttackRoot` 里那些 `update()` 刷新（roster/afford/血量）全变成纯 `VM.setValue(...)`，天然可单测（喂 flow 状态 → 断言塞进 VM 的值）。

**测试侧（保住 + 增强）：**
- 行为：VM setter 逻辑纯函数化后照旧无头单测。
- 契约：写个测试**解析 `.prefab`（Cocos prefab 就是 JSON）**，断言"必需的 `watchPath` 都在""`onReady` 事件绑定在""关键节点没被删/改名"。设计师改坏契约 → 测试红，**无头就抓到**。
- 视觉：Cocos 预览 / 截图，人看或视觉回归。

**净效果**：设计师全程可视化编辑，你**只丢了"美观无头测"（本就不存在）**，行为 + 契约继续无头守住。而且这套 Oops 已经带了，不引入外部产线、不用维护 fork。

---

## 3. 从现状迁移（每个视图三步）

以 `OpponentHud`（70 行、最轻）试点：
1. **抽逻辑**：把"算出对手 第X波/剩Y血/已倒"的纯逻辑留在 TS（或搬进一个 `OpponentHudVM`），单测它输出的 VM 数据。**✅ 已落地做参考**：`ui/opponentRows.ts`（纯函数 `opponentRows(opps) → {text,color,fallen}[]`，零 cc 依赖）+ `test/opponentRows.test.ts`（5 例：空占位/存活/已倒双判定/负血钳零/多对手）；`OpponentHud.setOpponents` 改为消费它，渲染逐字节不变（`ui-run.test` 仍绿）。这就是三层里"行为/数据"层——它**与最终选 Prefab+MVVM / FairyGUI / 代码化无关**，都复用同一份呈现数据。
2. **搬布局**：在 Creator 里做一个 `OpponentHud.prefab`，节点挂 `VM-Label` 绑 `versus.opp.round`/`.hearts`。
3. **换挂载**：`VersusRoot` 里 `addComponent(OpponentHud)` → 加载 prefab 实例化 + `VM.setValue(...)` 喂数据；删掉手写建节点。
4. **加契约测**：parse `OpponentHud.prefab` 断言必需绑定在。

跑通一个再铺开其余视图。**✅ 6 个对战视图的"行为/数据"层已全部抽离**（纯函数 + 单测、非破坏、`ui-run.test` 仍绿）：

| 视图 | 呈现纯函数 | 抽出的逻辑 |
|---|---|---|
| `OpponentHud` | `ui/opponentRows.ts` | 对手行文本/颜色/已倒判定/负血钳零 |
| `LobbyView` | `ui/lobbyRoster.ts` | 名单行(▶自己/掉线/准备)、准备按钮文案、房码占位 |
| `MatchResultView` | `ui/matchResultRows.ts` | 胜负标题、名次行(高亮/存活) |
| `ShopBar` | `ui/shopButton.ts` | 刷新文案 + 买得起态 + 底色 |
| `PropsBar` | `ui/propsChip.ts` | **点击决策**(施放/上膛/提示) + 充能比 |
| `BattleHud` | `ui/battleHudText.ts` | 信息条文本(金币取整) |

测试：`test/{opponentRows,uiPresenters,uiPresenters2}.test.ts`（共 16 例）。**这一层与最终 UI 方案无关**——选 Prefab+MVVM / FairyGUI / 代码化都复用同一份呈现数据。下一步（视方向）只剩"绑定契约 lint + 排版层接线"。

---

## 4. 如果坚持用 FairyGUI，同样这套三层照搬

- **行为**：纯 TS，照旧单测。
- **契约**：FairyGUI 的 `.fui` 是二进制，但**编辑器工程里的组件定义是 XML（文本）**——lint 那个 XML，断言"组件/控制器/元素命名"满足代码 `getChild("readyBtn")`/`getController("state")` 的期望。多状态用 FairyGUI 控制器（替代 `VM-State`），列表用虚拟列表。
- **视觉**：FairyGUI 预览 / Cocos 预览截图。
- 代价还是那两条：自维 3.8 fork + 二进制资产（见 [fairygui-eval.md](fairygui-eval.md) §4）。

> FairyGUI 的设计师体验（专业 UI 编辑器、控制器/gears/动效）确实强于 Cocos 原生 Prefab；但"让设计师参与 + 保住测试"这个**具体诉求**，Cocos Prefab + Oops MVVM 就够了，且成本低得多。

---

## 5. 给"视觉层"补一层半自动回归（可选，两方案通用）

美观虽靠眼睛，但"排版有没有被意外挪动"可半自动：**Cocos 预览（web）→ 无头浏览器截图 → 与基线图 diff**（像素/结构差异超阈值就报警）。这不是单测、但能进 CI，抓"设计师一改把别的挤歪了"这类回归。属加分项，不是必需。

---

## 6. 结论

- **"设计师参与"和"无头测试"不冲突**——因为无头测的是结构+行为，不是美观。
- **推荐**：Cocos **Prefab + Oops MVVM**（`VM-Label`/`VM-Event`/`VM-State`）。设计师在 Creator 里可视化改排版；程序只 `VM.setValue`；行为单测 + prefab 契约 lint 双保险；美观靠预览/截图。**框架已带、无 fork、无外部产线。**
- **FairyGUI**：仅当你要它更强的设计师产线/动效并接受自维 3.8 fork 时才上；届时把"契约 lint"从 prefab-JSON 换成 fui-editor-XML，三层模型不变。
- **别再手写节点**：现有 11 个代码化视图是"程序能测但设计师碰不了"的极端；引入 Prefab+MVVM 后，两边都满足。
