# Colyseus 客户端 SDK（UMD 插件）

- `colyseus.js`：npm 包 **@colyseus/sdk 0.17.43** 的自包含 UMD 构建（`dist/colyseus.js`，内含 @colyseus/schema 4.0.13），暴露全局 `Colyseus`，MIT 许可证（Copyright (c) 2026 Endel Dreyer，见文件头）。
- `colyseus.d.ts`：手写的全局类型声明（精简子集）。

## 为什么用 UMD 插件而不是 npm 导入

`@colyseus/sdk` 的 ESM 构建（build/index.mjs）含裸导入 `ws`、`@colyseus/shared-types` 等，
Cocos 工程对这些裸依赖的解析不稳定；因此使用自包含 UMD，并通过手写全局声明限制调用面。
参考：https://docs.colyseus.io/getting-started/cocos

## 产物已入库（维护团队升级工具）

`colyseus.js`（440KB，版本钉死 0.17.43，对齐服务端，⛔ 不飘 latest）**连同 Cocos 侧
`.meta` 一起入库**，新机 clone 或首次打开即可用。普通开发者不需要、也不应在日常流程中执行
依赖抓取。`npm run fetch:colyseus` 刻意保留，**仅供框架维护团队在需要显式升级版本时使用**；
它把下载、完整性校验和双端产物更新固化成可复现的维护步骤。脚本会：

- 校验 tarball sha512（对照脚本顶部钉死的 registry integrity，防镜像源分叉/篡改）；
- 把文件写进 `apps/client/src/lib/colyseus/`（sync 源）与 `apps/Cocos/assets/src/lib/colyseus/`；
- 保证 Cocos 侧 `.meta` 带 **「导入为插件 + 全平台加载」** 标记（uuid 稳定）——
  旧文档的「属性检查器手工勾插件」步骤已被此脚本替代，**无需任何编辑器手工操作**。

维护团队升级时，需同时核对服务端 Colyseus 依赖与客户端 major.minor；修改
`scripts/fetch-colyseus.mjs` 顶部版本号和 integrity 哈希后运行脚本，再人工对照同目录
`colyseus.d.ts` 与上游类型、运行 `npm run verify:sync` / `npm run test:client` 等相关校验，
确认生成的镜像、`.meta` 与 `scripts/vendor.sha256` 一并提交。脚本只更新已锁定的通用网络库，
不会扩展本仓库的项目范围。

`@colyseus/sdk` 在本仓中只作为通用网络客户端库使用。
