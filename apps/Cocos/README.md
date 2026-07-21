# apps/Cocos — Cocos Creator 3.8.8 工程壳

微信小游戏客户端的 Cocos 工程（引擎/资源/构建壳）。**游戏代码不在这里写**——
源码在 [../client](../client)（纯 TS 工程），由 `npm run sync:client` 灌入 `assets/src`。

## 目录

- `assets/src/` —— ⚠ 生成物，禁手改：`apps/client/src` 经 `sync:client` 同步而来
  （`.meta` 由 Cocos 编辑器生成/复用，随目录提交保证 uuid 稳定，新 checkout 可直接打开工程）
- `assets/resources/` —— FGUI 发布物等资源（`apps/art` 发布，见 [docs/CLIENT.md](../../docs/CLIENT.md)）
- `assets/scene.scene` —— 启动场景
- `settings/` —— 工程配置（提交入库）
- `extensions/fairygui-cc/` —— fairygui-cc 扩展外壳（运行时 `npm run fetch:fgui` 生成，不入库）
- `build-templates/` / `preview-template/` —— 微信小游戏构建/预览模板

## 打开方式

Cocos Dashboard 3.8.8 打开本目录，等首次导入（生成 `temp/`、`library/`，均已 gitignore）。
首次使用前先在仓库根目录跑
`npm install && npm run fetch:fgui && npm run fetch:colyseus && npm run sync:shared`
（fetch 两条每台机一次；`sync:shared` 已级联 `sync:client`，缺 `fetch:colyseus` 则预览时全局 `Colyseus` 不存在、登录进房直接失败）。
