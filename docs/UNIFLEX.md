# UniFlex 迁移

UniFlex 通用运行时入口在 `apps/client/src/kits/uniflex/`，SDK 运行时副本在
`apps/client/src/lib/uniflex/`，业务作者态在 `apps/client/src/ui-uniflex/`。
它是纯客户端 UI kit，只登记在 `KIT_CATALOG`，不进入 `plugins.generated.ts` / PluginHost。
正式 Confirm 已使用 UniFlex，既有 NavigationService 继续拥有业务路由；其他页面按原实现运行。

- 核心源码、API 面与依赖方向：[UniFlex kit](../apps/kits/uniflex/README.md)。
- 作者态、生成物、编译器配置与预览命令：[客户端文档](CLIENT.md#2-源码与工程壳)。
- 混合 FGUI/Cocos 排序和输入：[模态输入规则](CLIENT.md#interactive-的含义)。

Cocos 预览分两个场景：默认 `assets/scene.scene` 走原来的登录宿主；`assets/uniflex.scene` 只挂 UniFlex Confirm 预览。Web 预览仍是 `npm run dev:uniflex-web`。
