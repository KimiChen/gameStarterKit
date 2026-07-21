# apps/client — 纯 TS 游戏代码工程

纯 TS 的游戏客户端代码工程（对标 sect 的 TsProject）：视图/逻辑/网络/共享契约全在这里，
**不含任何 Cocos 工程文件与 `.meta`**，脱离 Creator 即可 typecheck 与无头单测。
Cocos Creator 工程壳在 [../Cocos](../Cocos)，代码经同步脚本灌入 `apps/Cocos/assets/src` 后由 Creator 编译。

**「纯 TS」≠「引擎无关」**——引擎无关的只有 `logic/` + `shared/` + `lib/bitecs/`
（`logic-purity.test.ts` 机检禁 cc/fairygui）；`Main.ts` 与 `view/` 绑 cc + fairygui-cc、
`core/` 绑 wx/XHR、`net/` 绑全局 Colyseus UMD，跨引擎复用时这些层需按目标引擎重写。

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
- `test/` —— 无头单测（`npm run test:fgui`，tsx 直跑，不依赖 Creator）
- `cc-stub.d.ts` —— 无头类型检查用的 cc 声明桩（fairygui 绑定层不在无头检查范围，
  其声明 `fairygui-cc.d.ts` 在 [../Cocos](../Cocos) 工程壳侧，由 Creator 编译时使用）
- `tsconfig.json` —— 独立类型检查配置（`npm run typecheck:client`，不 extends Creator 的 temp/）
