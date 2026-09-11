# UniFlex 客户端核心

本目录只放可复用 UI 运行时与 `api/<surface>/index.ts` 公共入口，不放业务作者态、Logic 或路由。
SDK 运行时副本在 `src/lib/uniflex/`，kit 只通过 `src/lib/uniflex/mod/` 的 TypeScript 入口引用它。
所有权、宿主隔离和接入规则以 [kit 文档](../../../../kits/uniflex/README.md) 为准。
