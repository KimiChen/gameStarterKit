# apps/client — 纯 TS 游戏代码工程

游戏客户端的 TypeScript 源码真相：视图、逻辑、网络和共享契约镜像都在这里，
**不含 Cocos 工程文件与 `.meta`**。其中引擎无关代码可脱离 Creator 做严格类型检查和无头测试；
当前检查并没有覆盖整个目录。
Cocos Creator 工程壳在 [../Cocos](../Cocos)，代码经同步脚本灌入 `apps/Cocos/assets/src` 后由 Creator 编译。

**「纯 TS」≠「引擎无关」**——引擎无关代码主要在 `logic/`、`shared/`、`lib/bitecs/`，以及
`view/areaPresentation.ts`、`fguiContracts.ts`、`defineView.ts`、`layers.ts` 等纯数据文件
（`logic-purity.test.ts` 机检 Logic 禁 cc/fairygui）。`Main.ts` 与多数 View 绑定 cc + fairygui-cc，
`core/` 负责宿主环境桥与 XHR，`net/` 依赖全局 Colyseus UMD；跨引擎复用时这些层需按目标引擎重写。

`npm run typecheck:client` 当前排除 `Main.ts` 及 9 个依赖 FairyGUI/Cocos 的 View 文件；
`apps/client/test` 由 `npm run test:fgui` 通过 `tsx` 执行，也不在该严格编译范围内。Creator 预览、
同步检查和无头行为测试是必要补充，类型盲区的收口计划见 [根 plan](../../plan.md)。

## 同步链

```
apps/shared/src ──npm run sync:shared──▶ apps/client/src/shared ──npm run sync:client──▶ apps/Cocos/assets/src
```

- 日常只改 `src/`（`src/shared/` 除外——那是 `sync:shared` 生成物，禁手改；改 `apps/shared/src` 再同步）。
- 改完跑 `npm run sync:client`（或常驻 `npm run dev:client` 双 watcher 全链自动同步）；
  忘跑有机检兜底：`npm run verify:sync`（挂在 `typecheck` 尾部）漂移即红。
- `src/lib/bitecs/` 12 个 .ts 是字节锁区（`npm run verify:ecs`），禁改。

## 目录

- `src/` —— 游戏代码（view/logic/net/core/lib/shared，视图/逻辑二分见 [docs/CLIENT.md](../../docs/CLIENT.md)）
- `test/` —— 无头单测（`npm run test:fgui`，tsx 直跑，不依赖 Creator，但不是严格类型检查）
- `cc-stub.d.ts` —— 已纳入客户端源码的无头类型检查所用 cc 声明桩（fairygui 绑定层不在无头检查范围，
  其声明 `fairygui-cc.d.ts` 在 [../Cocos](../Cocos) 工程壳侧，由 Creator 编译时使用）
- `tsconfig.json` —— 独立类型检查配置及当前排除清单（`npm run typecheck:client`，不 extends Creator 的 temp/）
