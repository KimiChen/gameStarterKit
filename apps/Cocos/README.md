# apps/Cocos — Cocos Creator 3.8.8 工程壳

Cocos 客户端开发工程（引擎、资源与编辑器壳）。**游戏代码不在这里写**——
源码在 [../client](../client)（纯 TS 工程），由 `npm run sync:client` 灌入 `assets/src`。

## 目录

- `assets/src/` —— ⚠ 生成物，禁手改：`apps/client/src` 经 `sync:client` 同步而来
  （`.meta` 由 Cocos 编辑器生成/复用，随目录提交保证 uuid 稳定，新 checkout 可直接打开工程）
- `assets/resources/` —— FGUI 本地导出物等资源（见 [docs/CLIENT.md](../../docs/CLIENT.md)）
- `assets/scene.scene` —— 启动场景
- `settings/` —— 工程配置（提交入库）
- `extensions/fairygui-cc/` —— fairygui-cc 扩展（外壳 + 运行库均入库；升级用 `npm run fetch:fgui`）

## 打开方式

Cocos Dashboard 3.8.8 打开本目录，等首次导入（生成 `temp/`、`library/`，均已 gitignore）。
首次使用前先在仓库根目录跑 `npm install && npm run sync:shared`
（`sync:shared` 已级联 `sync:client`；运行时产物——colyseus UMD、fairygui-cc 运行时——已入库，无需 fetch）。
