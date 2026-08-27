# http/ —— 开发期 utility 与契约示例端点（见 docs/SERVER.md）

- `index.ts` = 唯一装配点（createRouter 静态 spread）；根层只放横切助手（common.ts）
- 子目录 = 域：`<域>/<接口>.ts`，default 导出 `createEndpoint(...)`；新增端点 = 建文件 + index 两行
- 玩法取数⛔不走 HTTP——走 `../websocket/`（docs/SERVER.md 的通道分工）
- 开发会话与选服示例由独立 WebPlatform Public API 提供；游戏服不挂兼容代理
- typed router 优先于 express
