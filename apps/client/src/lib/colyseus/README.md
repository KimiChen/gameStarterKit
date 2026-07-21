# Colyseus 客户端 SDK（UMD 插件）

- `colyseus.js`：npm 包 **@colyseus/sdk 0.17.43** 的自包含 UMD 构建（`dist/colyseus.js`，内含 @colyseus/schema 4.0.13），暴露全局 `Colyseus`，MIT 许可证（Copyright (c) 2026 Endel Dreyer，见文件头）。
- `colyseus.d.ts`：手写的全局类型声明（精简子集）。

## 为什么用 UMD 插件而不是 npm 导入

`@colyseus/sdk` 的 ESM 构建（build/index.mjs）含裸导入 `ws`、`@colyseus/shared-types` 等，
Cocos 的构建管线（尤其微信小游戏）解析不可靠；自包含 UMD 是 Colyseus 官方文档推荐的
Cocos 集成方式（维护者确认：不再有 Cocos 专用构建，直接用 dist 包）。
参考：https://docs.colyseus.io/getting-started/cocos

## ⚠ 产物不入库：每台机先跑 `npm run fetch:colyseus`

`colyseus.js`（440KB）由 `npm run fetch:colyseus` 从 npm 拉取（版本钉死 0.17.43，
对齐服务端，⛔ 不飘 latest），`.gitignore` 忽略、可再生。脚本同时：

- 把文件写进 `apps/client/src/lib/colyseus/`（sync 源）与 `apps/Cocos/assets/src/lib/colyseus/`；
- 保证 Cocos 侧 `.meta` 带 **「导入为插件 + 全平台加载」** 标记（uuid 稳定）——
  旧文档的「属性检查器手工勾插件」步骤已被此脚本替代，**无需任何编辑器手工操作**。

升级 = 改 `scripts/fetch-colyseus.mjs` 顶部版本号（连同服务端依赖）再跑一次。

## 微信小游戏注意

微信环境缺少 Headers / URL / URLSearchParams / TextEncoder，且 wx 的 WebSocket
只接受 string | ArrayBuffer——这些兼容补丁在 `src/core/wechat-compat.ts`
中统一处理（必须在任何 Colyseus 调用之前导入），参考 colyseus/colyseus#945。
