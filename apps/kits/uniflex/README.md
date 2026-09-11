# UniFlex UI 核心

宿主维护的 UI kit，不登记业务页面、不进入 `plugins.generated.ts`、不参与 PluginHost 启动，不提供 SQL、玩法或网络协议。
清单无 `version`，暂不通过 `plugin -- pack/install` 分发；Cocos/Web 运行时使用入库的 `src/lib/uniflex/`，vendor tarball 只作为 AOT 与升级输入。

## 源码与入口

- 运行时真源：[apps/client/src/kits/uniflex](../../client/src/kits/uniflex)。
- SDK 运行时副本：[apps/client/src/lib/uniflex](../../client/src/lib/uniflex)，由 `npm run fetch:uniflex` 从 `vendor/uniflex/` 解包。Cocos 通过 `mod/` 下的 TypeScript 入口加载 ESM。
- `runtime.ts`：Web/Cocos 共用的资源加载、导航、取消与释放所有权，不导入具体宿主或业务。
- `api/core/index.ts`：核心类型、资源引用与通用 runtime。
- `api/navigation/index.ts`、`api/provider/index.ts`：导航和资源准备接口。
- `api/cocos/index.ts`：CocosProvider、UniFlexCocosRuntime。
- `api/web/index.ts`：WebProvider、UniFlexWebRuntime，不导入 `cc`。

调用方通过上述 `api/<surface>/index.ts` 导入；插件使用时须声明
`requires.kits.uniflex.<surface>: 1`。API 面变化同步维护 `kit.json` 的版本。
不同宿主独立入口，禁止用一个 barrel 同时导入 Web 与 Cocos。

## 业务边界

Confirm 作者态、Logic、路由、资源配置和预览装配仍在 `apps/client/src` 的业务目录。
kit 不反向导入这些文件；调用方传入 provider 资源映射、`loadUI`、初始 UI 定义和参数。
作者态的 `defineView` 保留 `@uniflex/compiler` 导入，这是 AOT 编译器识别的标记；
编译器输出中的 SDK 内部导入由生成器管理，不人工修改。

依赖安装、AOT 命令和产物边界见 [客户端文档](../../../docs/CLIENT.md)。
源码经 `npm run sync:client` 镜像到 Cocos，禁止手改镜像。
`npm run test:client` 覆盖两端生命周期和 kit 导入边界；
真实 Cocos/Web 预览不能替代 Creator 3.8.8、微信真机或性能验收。
