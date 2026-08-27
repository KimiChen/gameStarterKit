# fgui-codegen — FairyGUI 结构契约 + 视图脚手架工具（无头）

FairyGUI 方案里“**结构契约无头测**”的核心（见[客户端 codegen 说明](../../docs/CLIENT.md#5-fairygui-codegen)）。
工具不启动 Creator，也不依赖 `fairygui-cc` 运行时；命令通过 Node + `tsx` 执行，只解析 FairyGUI
编辑器的组件 XML（`apps/art/fairygui/assets/<Pkg>/<Comp>.xml`）：

- `parseFgui.ts` — 组件 XML → displayList 直接子元素清单（list 的 item/relation 等嵌套不计）。
- `binding.ts`：
  - `bindingFields(comp)` — 按命名前缀约定（`btn_/tge_/txt_/ld_/ld3_/lst_/img_/go_/jb_/pg_`）算绑定字段。
  - **四个 AUTO 区块**（docs/CLIENT.md §5）：`IMPORT`（fairygui 类导入）/ `REQUIRED`（PKG/COMP/契约常量）/
    `FIELD`（字段声明）/ `BIND`（getChild 绑定）。标记语法
    `// #region AUTO <KIND> DONT CHANGE` … `// #endregion AUTO <KIND>`（结束标记带 KIND——
    通用 `#endregion` 会与业务代码的折叠标记混淆而误吞代码）。
  - `emitFguiViewScaffold` — 首次生成 View 脚手架；`regenerateViewSource` — **幂等区块重写**
    （组件 XML 结构变更后重跑：区块内覆盖、区块外业务代码一字不动；同输入重复跑零 diff）。
  - `checkContract(comp, required)` — 断言解析后的组件 XML 满足 View 声明的必需字段。
    **设计师删/改名 code 依赖的元素 → 契约测红。**
- `cli.ts` — 可运行入口（守门测试报「AUTO 区块不同步」时跑它）。

## 用法

```bash
npm run test:fgui                          # 跑 codegen 测试 + 全部客户端无头测试，无需 Creator
npm run codegen:fgui -- <Pkg> <Comp>       # 生成/幂等重写 view/<Comp>View.ts（[ViewClass] 可选第三参）
```

契约把关是**双向机检**（`apps/client/test/viewRegistry.test.ts`）：View 文件的 AUTO 区块对组件 XML 现状做
`regenerateViewSource` 恒等断言——「忘跑 codegen」与「手改生成区」同一条断言抓住。

当前 parser 只读取 `displayList` 的直接子元素；不会验证 relation、列表 item/defaultItem、
`autoClearItems`，也不会比较 FairyGUI 设计源与 Cocos 中已导出 `.bin`/图集的新鲜度。`test:fgui` 通过
`tsx` 执行测试，还不能替代被 client tsconfig 排除的 View/入口严格类型检查；准确缺口见
[根 plan](../../plan.md)。

> 运行时绑定（`FguiView.bind/apply`、`getChild`）需 `fairygui-cc`，属 Creator 侧接线。
