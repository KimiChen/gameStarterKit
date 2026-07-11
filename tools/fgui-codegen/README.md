# fgui-codegen — FairyGUI 结构契约工具（无头）

FairyGUI 方案里"**结构契约无头测**"的核心（见 [docs/research/fairgui.md](../../docs/research/fairgui.md) §4）。
纯 Node、零依赖、无 `fairygui-cc` 运行时——只**解析 FairyGUI 编辑器的组件 XML**（`apps/art/fairygui/assets/<Pkg>/<Comp>.xml`）：

- `parseFgui.ts` — 组件 XML → displayList 直接子元素清单（list 的 item/relation 等嵌套不计）。
- `binding.ts`：
  - `bindingFields(comp)` / `emitAutoFieldBlock(fields)` — 按命名前缀约定（`btn_/txt_/ld_/lst_/img_/go_/jb_`）
    生成 `// #region AUTO FIELD DONT CHANGE` 绑定块（codegen 产物，人勿手改）。
  - `checkContract(comp, required)` — 断言 `.fui` 组件满足某 View 声明的必需字段（缺失/类型不符即违约）。
    **设计师在编辑器里删了/改名了 code 依赖的元素 → 契约测红。**

## 用法

```bash
npm run test:fgui        # 跑本目录单测(纯解析,无需 fairygui-cc / Creator)
```

两种契约把关（见 fairgui.md §4）：
- **做法 A（推荐）**：codegen 生成 AUTO FIELD 块入库；重跑 codegen 与提交版 `git diff`，非空即违约。
- **做法 B**：每个 View 声明 `REQUIRED: BindingField[]`，测试用 `checkContract` 断言。

> 这是骨架 + 无头契约核心。运行时绑定（`FguiView.bind/apply`、`getChild`）需 `fairygui-cc`，属 Creator 侧接线。
