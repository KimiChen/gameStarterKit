# apps/client — 纯 TS 游戏代码工程

游戏客户端的 TypeScript 源码真相：视图、逻辑、网络和共享契约镜像都在这里，
**不含 Cocos 工程文件与 `.meta`**。Node 无头 strict 探针覆盖本目录的 `src/**/*.ts` 与
`test/**/*.ts`；真实 Creator 类型、资源导入和交互仍由 Cocos 工程侧补充验证。
Cocos Creator 工程壳在 [../Cocos](../Cocos)，代码经同步脚本灌入 `apps/Cocos/assets/src` 后由 Creator 编译。

**「纯 TS」≠「引擎无关」**——引擎无关代码主要在 `logic/`、`shared/`、`lib/bitecs/`，以及
`view/areaPresentation.ts`、`fguiContracts.ts`、`defineView.ts`、`layers.ts` 等纯数据文件
（`logic-purity.test.ts` 机检 Logic 禁 cc/fairygui）。`Main.ts` 与多数 View 绑定 cc + fairygui-cc，
`core/` 负责宿主环境桥、XHR 与开发期错误弹框，`net/` 依赖全局 Colyseus UMD；跨引擎复用时这些层需按目标引擎重写。

`npm run typecheck:client` 使用 `tsconfig.test.json` 和 Node 侧最小 `cc`/FairyGUI 桩，严格编译
`Main.ts`、全部 View/`pages.ts`/ViewMgr 以及客户端测试；`npm run typecheck:client:legacy` 使用
`tsconfig.json` 的 Creator 兼容配置、`cc-stub.d.ts` 和 ES2017 lib，递归检查全部 `src/**/*.ts`（含
`Main.ts`、View、`gameplay/`）。根 `npm run typecheck` 会依次运行这两个探针，前者覆盖完整源码与测试，
后者守住完整客户端源码的 ES2017 运行时下限。
`npm run test:client` 运行全部客户端无头测试，
`npm run test:fgui` 只运行 FGUI codegen/registry/契约专项测试。Creator 预览、同步检查和无头行为测试
仍是完整验收的一部分。

## 同步链

```
apps/shared/src ──npm run sync:shared──▶ apps/client/src/shared ──npm run sync:client──▶ apps/Cocos/assets/src
```

- 日常只改 `src/`（`src/shared/` 除外——那是 `sync:shared` 生成物，禁手改；改 `apps/shared/src` 再同步）。
- 改完跑 `npm run sync:client`（或常驻 `npm run dev:client` 双 watcher 全链自动同步）；
  忘跑有机检兜底：`npm run verify:sync`（挂在 `typecheck` 尾部）漂移即红。
- `src/lib/bitecs/` 12 个 .ts 是字节锁区（`npm run verify:ecs`），禁改。
- 原生客户端的登录首页由 `src/native/host.ts` 选择；必须经过 PluginHost 装载并登记 authenticated base，让登录与断线恢复使用同一路由。首页不能提供会关闭自身留下空白画面的按钮。
- Native 登录和断线恢复以 `auth.ok` 为建档完成边界，玩法页面拉取自己的快照；不再调用已停用的旧 `user.getInfo`，也不伪造 `IUserView`。Colyseus 登录仍校验并提交旧档案。
- 开发登录默认首次生成独立 devKey，通过 `sys.localStorage` 保存到 `<PROJECT_ID>.dev-account.v1`，然后调用既有 dev-login 注册 / 登录；刷新复用缓存，不持久化 token。`?devKey=` 只临时覆盖、不改默认缓存。清理站点数据会生成新账号；同源多标签共享账号，多人测试应使用独立浏览器缓存或显式不同 devKey。

## 目录

- `src/` —— 游戏代码（view/logic/net/core/lib/shared，视图/逻辑二分见 [docs/CLIENT.md](../../docs/CLIENT.md)）
- `test/` —— 无头单测（`npm run test:client`，tsx 直跑；同时纳入 `tsconfig.test.json` strict 编译）
- `client-test-stubs.d.ts` —— `tsconfig.test.json` 使用的 Node 侧 cc/FairyGUI/Colyseus 最小声明桩
- `cc-stub.d.ts` —— Creator 兼容 legacy 配置使用的 cc 声明桩
- `tsconfig.test.json` —— Node 无头 strict 配置，覆盖全部客户端源码和测试（不 extends Creator 的 temp/）
- `tsconfig.json` —— Creator 兼容 legacy 配置，递归覆盖全部 `src/**/*.ts`（仅排除非 TS `.meta`）
