# http/ —— 游戏服 HTTP endpoint

`index.ts` 是唯一静态装配点。新增 endpoint 使用 `<domain>/<method>.ts`，默认导出
`createGameEndpoint(contractKey, ...)` 结果，再显式 import 并加入 `routes`。该工厂在序列化前调用
shared `GameHttpContractMap` 的 response validator；根层当前没有 `common.ts`。

当前路由：

| Method / path | 文件 | 定位 |
| --- | --- | --- |
| `GET /healthz` | `misc/healthz.ts` | 只证明进程存活；由 `GameHttpContractMap.Health` 派生 path/method 并验证 response |
| `GET /version` | `misc/version.ts` | Demo 协议版本；由 `GameHttpContractMap.Version` 派生并验证 response |
| `GET /clock/now` | `misc/clockNow.ts` | Demo 对时；由 `GameHttpContractMap.ClockNow` 派生并验证 response |
| `GET /notice/list` | `notice/list.ts` | 静态公告 Demo；由 `GameHttpContractMap.NoticeList` 派生并验证 response |
| `POST /admin/kick` | `admin/kick.ts` | 非核心强制下线参考，见 EXTRAFEATURES |
| `POST /pay/wx-notify` | `pay/wxNotify.ts` | 默认关闭的非核心参考，见 EXTRAFEATURES |

登录与选区由外部 WebPlatform Public API 提供，游戏服不挂兼容代理。Lobby 内的一问一答玩法数据使用
`../websocket/` RPC；HTTP 是否适合某个新功能仍应按缓存、鉴权和交互语义判断，不能只按目录惯例决定。

当前六个游戏服 endpoint 均由 `GameHttpContractMap` 登记 method/path/request/response；每个 request validator
在 shared 定义处直接生成 Standard Schema。`createGameEndpoint` 从 contract key 派生 path、校验 method，给
带 body 的路由安装该 shared schema，并在序列化前验证 response；endpoint options 不得另带 body schema。
当前仍没有统一的应用层 body 大小上限。新增核心 HTTP 契约时应先补齐 shared contract，再登记 router，并补
request 非法向量与 shared schema 来源测试。

完整 route matrix、限制和额外能力分类见
[`docs/SERVER.md §6`](../../../../docs/SERVER.md#6-http-开发边界) 与
[`docs/EXTRAFEATURES.md`](../../../../docs/EXTRAFEATURES.md)。
