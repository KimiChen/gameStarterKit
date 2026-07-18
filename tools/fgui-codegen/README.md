# fgui-codegen — FairyGUI 结构契约 + 视图脚手架工具（无头）

FairyGUI 方案里"**结构契约无头测**"的核心（见 [docs/CLIENT.md](docs/CLIENT.md) §4）。
纯 Node、零依赖、无 `fairygui-cc` 运行时——只**解析 FairyGUI 编辑器的组件 XML**（`apps/art/fairygui/assets/<Pkg>/<Comp>.xml`）：

- `parseFgui.ts` — 组件 XML → displayList 直接子元素清单（list 的 item/relation 等嵌套不计）。
- `binding.ts`：
  - `bindingFields(comp)` — 按命名前缀约定（`btn_/tge_/txt_/ld_/lst_/img_/go_/jb_`）算绑定字段。
  - **四个 AUTO 区块**（docs/CLIENT.md 方案 2）：`IMPORT`（fairygui 类导入）/ `REQUIRED`（PKG/COMP/契约常量）/
    `FIELD`（字段声明）/ `BIND`（getChild 绑定）。标记语法
    `// #region AUTO <KIND> DONT CHANGE` … `// #endregion AUTO <KIND>`（结束标记带 KIND——
    通用 `#endregion` 会与业务代码的折叠标记混淆而误吞代码）。
  - `emitFguiViewScaffold` — 首次生成 View 脚手架；`regenerateViewSource` — **幂等区块重写**
    （`.fui` 结构变更后重跑：区块内覆盖、区块外业务代码一字不动；同输入重复跑零 diff）。
  - `checkContract(comp, required)` — 断言 `.fui` 组件满足 View 声明的必需字段。
    **设计师删/改名 code 依赖的元素 → 契约测红。**
- `cli.ts` — 可运行入口（守门测试报「AUTO 区块不同步」时跑它）。

## 用法

```bash
npm run test:fgui                          # 跑单测 + 客户端契约/注册表守门(纯解析,无需 Creator)
npm run codegen:fgui -- <Pkg> <Comp>       # 生成/幂等重写 view/<Comp>View.ts（[ViewClass] 可选第三参）
```

契约把关是**双向机检**（test/viewRegistry.test.ts）：View 文件的 AUTO 区块对 `.fui` 现状做
`regenerateViewSource` 恒等断言——「忘跑 codegen」与「手改生成区」同一条断言抓住。

> 运行时绑定（`FguiView.bind/apply`、`getChild`）需 `fairygui-cc`，属 Creator 侧接线。
