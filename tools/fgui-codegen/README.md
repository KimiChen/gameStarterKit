# fgui-codegen — FairyGUI 结构契约 + 视图脚手架工具（无头）

FairyGUI 方案里“**结构契约无头测**”的核心（见[客户端 codegen 说明](../../docs/CLIENT.md#5-fairygui-codegen)）。
工具不启动 Creator，也不依赖 `fairygui-cc` 运行时；命令通过 Node + `tsx` 执行，只解析 FairyGUI
编辑器的组件 XML（`apps/art/fairygui/assets/<Pkg>/<Comp>.xml`）：

- `parseFgui.ts` — 组件 XML → displayList 直接子元素 + 可递归遍历的 `children`/`nestedElements`，并保留
  list `defaultItem`/模板数量、controller、relation 与 `ui://` 资源引用。
- `binding.ts`：
  - `bindingFields(comp)` — 按命名前缀约定（`btn_/tge_/txt_/ld_/ld3_/lst_/img_/go_/jb_/pg_`）算绑定字段。
  - **四个 AUTO 区块**（docs/CLIENT.md §5）：`IMPORT`（fairygui 类导入）/ `REQUIRED`（PKG/COMP/契约常量）/
    `FIELD`（字段声明）/ `BIND`（getChild 绑定）。标记语法
    `// #region AUTO <KIND> DONT CHANGE` … `// #endregion AUTO <KIND>`（结束标记带 KIND——
    通用 `#endregion` 会与业务代码的折叠标记混淆而误吞代码）。
  - `emitFguiViewScaffold` — 首次生成 View 脚手架；`regenerateViewSource` — **幂等区块重写**
    （组件 XML 结构变更后重跑：区块内覆盖、区块外业务代码一字不动；同输入重复跑零 diff）。
  - `checkContract(comp, required)` — 断言解析后的组件 XML 满足 View 声明的必需字段；required 可用
    `path` 校验嵌套元素。`nestedBindingFields` 提供显式嵌套绑定清单，既有 AUTO 区块仍只生成直接字段。
    **设计师删/改名 code 依赖的元素 → 契约测红。**
- `cli.ts` — 可运行入口（守门测试报「AUTO 区块不同步」时跑它）。

## 用法

```bash
npm run test:client                         # 跑全部客户端无头行为测试，无需 Creator
npm run test:fgui                            # 跑 FGUI codegen/registry/结构契约专项测试
npm run codegen:fgui -- <Pkg> <Comp>       # 生成/幂等重写 view/<Comp>View.ts（[ViewClass] 可选第三参；--view-dir 可换输出目录）
```

本工具只写 View AUTO 区（Non-intrusive §7.5）：契约/注册表是 `codegen:plugins` 的生成物
（`apps/client/src/generated/{fguiContracts,views}.generated.ts`，真源为 View 同目录的
`<Name>View.view.json` sidecar + `apps/plugins/<id>/plugin.json`），⛔ 不再要求手改
`fguiContracts.ts` / `viewRegistry.ts`（两者是稳定 façade）。AUTO 重写后可运行
`npm --workspace @game/server run codegen:plugins -- --check` 校验生成物新鲜度；本工具
不覆盖 registry/contracts，也不自动执行 FGUI manifest `--write`（那是显式资源审计锁）。

契约把关是**双向机检**（`apps/client/test/viewRegistry.test.ts`）：View 文件的 AUTO 区块对组件 XML 现状做
`regenerateViewSource` 恒等断言——「忘跑 codegen」与「手改生成区」同一条断言抓住。

`scripts/fgui-manifest.mjs` 负责资源闭包和导出新鲜度：`npm run verify:fgui` 只读检查
`scripts/fgui.manifest.json` 记录的 XML/资源、包导出声明、Cocos `.bin`/图集以及 View AUTO 生成区哈希；
FairyGUI 重新导出后先运行 `node scripts/fgui-manifest.mjs --write` 再提交 manifest。
`test:fgui` 通过 `tsx` 执行 FGUI 专项测试；客户端入口/View 的 Node strict 类型检查由
`npm run typecheck:client`（`apps/client/tsconfig.test.json`）负责，`npm run typecheck:client:legacy` 以
ES2017 lib 递归检查全部 `apps/client/src/**/*.ts`；真实引擎接线仍需 Creator 预览。

> 运行时绑定（`FguiView.bind/apply`、`getChild`）需 `fairygui-cc`，属 Creator 侧接线。
