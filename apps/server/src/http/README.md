# http/ —— 真实 HTTP 端点（auth / 支付 / utility，见 docs/SERVER.md）

- `index.ts` = 唯一装配点（createRouter 静态 spread）；根层只放横切助手（common.ts）
- 子目录 = 域：`<域>/<接口>.ts`，default 导出 `createEndpoint(...)`；新增端点 = 建文件 + index 两行
- 玩法取数⛔不走 HTTP——走 `../websocket/`（docs/SERVER.md 的通道分工）
- mock 层已移除（登录走 `/account/dev-login` 真实链路）；typed router 优先于 express
