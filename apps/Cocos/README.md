# apps/Cocos — Cocos Creator 3.8.8 工程壳

Cocos 客户端开发工程（引擎、资源与编辑器壳）。**游戏代码不在这里写**——
源码在 [../client](../client)（纯 TS 工程），由 `npm run sync:client` 灌入 `assets/src`。

## 目录

- `assets/src/` —— ⚠ 生成物，禁手改：`apps/client/src` 经 `sync:client` 同步而来
  （`.meta` 由 Cocos 编辑器生成/复用，随目录提交保证 uuid 稳定，新 checkout 可直接打开工程）
- `assets/resources/` —— FGUI 本地导出物等资源（见 [docs/CLIENT.md](../../docs/CLIENT.md)）
- `assets/scene.scene` —— 启动场景
- `settings/` —— 工程配置（提交入库）
- `extensions/fairygui-cc/` —— fairygui-cc 扩展（外壳 + 运行库均入库；仅框架维护团队显式升级时运行
  `npm run fetch:fgui`，普通开发无需抓取）

## 打开方式

Cocos Dashboard 3.8.8 打开本目录，等首次导入（生成 `temp/`、`library/`，均已 gitignore）。
首次使用前先在仓库根目录跑 `npm install && npm run sync:shared`
（`sync:shared` 已级联 `sync:client`；运行时产物——colyseus UMD、fairygui-cc 运行时和锁定的
 bitECS 源码——已入库，无需 fetch。依赖抓取脚本只用于框架维护团队显式升级。）

Node 无头 strict 探针（`npm run typecheck:client`）已经覆盖 `Main.ts`、全部 View、`pages.ts`、
ViewMgr 和客户端测试，使用 `apps/client/tsconfig.test.json` 的最小引擎桩；`npm run typecheck:client:legacy`
再以 ES2017 lib 检查 `apps/client/src/**/*.ts` 全部源码（含 Main、View、gameplay）。Creator 本地预览仍是真实入口装配、引擎类型、
资源导入和页面交互的必要验证；Cocos 工程自身的 `tsconfig.json` 只负责编辑器侧兼容编译。准确范围见
[客户端文档](../../docs/CLIENT.md#8-本地检查)，核心/额外能力边界见
[根 README](../../README.md#项目边界)。
