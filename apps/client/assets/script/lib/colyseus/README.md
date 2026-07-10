# Colyseus 客户端 SDK（UMD 插件）

- `colyseus.js`：npm 包 **@colyseus/sdk 0.17.43** 的自包含 UMD 构建（`dist/colyseus.js`，内含 @colyseus/schema 4.0.13），暴露全局 `Colyseus`，MIT 许可证（Copyright (c) 2026 Endel Dreyer，见文件头）。
- `colyseus.d.ts`：手写的全局类型声明（精简子集）。

## 为什么用 UMD 插件而不是 npm 导入

`@colyseus/sdk` 的 ESM 构建（build/index.mjs）含裸导入 `ws`、`@colyseus/shared-types` 等，
Cocos 的构建管线（尤其微信小游戏）解析不可靠；自包含 UMD 是 Colyseus 官方文档推荐的
Cocos 集成方式（维护者确认：不再有 Cocos 专用构建，直接用 dist 包）。
参考：https://docs.colyseus.io/getting-started/cocos

## ⚠ 首次打开编辑器后的一次性手动配置

在 Cocos Creator 资源管理器中选中 `colyseus.js`，属性检查器里：

1. 勾选 **导入为插件（Import As Plugin）**
2. 勾选 **允许编辑器加载**、Web、**小游戏**、原生平台加载
3. 点击右上角 ✓ 应用，然后重启编辑器

之后即可在任意脚本中直接使用全局 `Colyseus`（类型由 `colyseus.d.ts` 提供，无需 import）。

## 版本与升级

- 版本必须与服务端 colyseus 的 major.minor 一致（当前双端均为 **0.17.x**）
- 升级方式：`curl -L https://unpkg.com/@colyseus/sdk@<版本>/dist/colyseus.js -o colyseus.js`，
  同步更新服务端依赖与本 README 的版本号

## 微信小游戏注意

微信环境缺少 Headers / URL / URLSearchParams / TextEncoder，且 wx 的 WebSocket
只接受 string | ArrayBuffer——这些兼容补丁在 `assets/script/net/wechat-compat.ts`
中统一处理（必须在任何 Colyseus 调用之前导入），参考 colyseus/colyseus#945。
