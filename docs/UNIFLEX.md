# UniFlex 迁移

UniFlex 通用运行时入口在 `apps/client/src/kits/uniflex/`，SDK 运行时副本在
`apps/client/src/lib/uniflex/`，业务作者态在 `apps/client/src/ui-uniflex/`。
它是纯客户端 UI kit，只登记在 `KIT_CATALOG`，不进入 `plugins.generated.ts` / PluginHost。
正式 Confirm 已使用 UniFlex，既有 NavigationService 继续拥有业务路由；其他页面按原实现运行。

- 按切图实现业务页（作者态、预览路由、AOT）：[UNIFLEX-UI.md](UNIFLEX-UI.md)。
- 核心源码、API 面与依赖方向：[UniFlex kit](../apps/kits/uniflex/README.md)。
- 作者态、生成物、编译器配置与预览命令：[客户端文档](CLIENT.md#2-源码与工程壳)。
- 混合 FGUI/Cocos 排序和输入：[模态输入规则](CLIENT.md#interactive-的含义)。

Cocos 预览分两个场景：默认 `assets/scene.scene` 走原来的登录宿主；`assets/uniflex.scene` 只挂 UniFlex Confirm 预览。Web 预览仍是 `npm run dev:uniflex-web`。

## 候选 FairyGUI 导出（独立工程）

`ui:export-fgui` 从 UniFlex 组件树 + 布局快照写出一份**候选**独立 FairyGUI 工程（只写 `--out`，不写 `apps/art/fairygui`，不伪造 Cocos `.bin` / 图集 / `.meta`）。共享组件来自 `defineComponent` 目录（`components.generated.json`，出现在快照里才进 `UniFlex_Common`）。纯色背景写成 9 宫格填充图，不使用 Graph。`--screen` 出单页包 `UniFlex_<Page>`；`--screens a,b` 或 `--all` 把多页收进同一工程，预览用 `?screen=` 切换。`PopupFrame` 因 Slot 限制只出外壳模板；各页是特化树。变体组件（如 `PanelTab` 的 kind）按首次出现做模板，可见图不同则内联，不生成 controller。`virtual-list` / `scroll-view` 导出为独立的垂直滚动组件（行收进子组件、裁剪 + 触摸滚动，隐藏滚动条），不再是拍平行。`ui:preview-fgui` 用锁定的官方 `fairygui-dom@1.0.0` 预览发布态包。未完成 Editor 保存—重开前，不要把它当成已发布 FGUI 资源。
