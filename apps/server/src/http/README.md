# http/ —— 游戏服 HTTP endpoint

`index.ts` 是唯一静态装配点。新增 endpoint 使用 `<domain>/<method>.ts`，默认导出
`createEndpoint(...)` 结果，再显式 import 并加入 `routes`。根层当前没有 `common.ts`。

当前路由：

| Method / path | 文件 | 定位 |
| --- | --- | --- |
| `GET /healthz` | `misc/healthz.ts` | 只证明进程存活；shared 有匹配 path/response，endpoint 仍重复路径字面量 |
| `GET /version` | `misc/version.ts` | Demo 协议版本；response 在 shared |
| `GET /clock/now` | `misc/clockNow.ts` | Demo 对时；response 在 shared |
| `GET /notice/list` | `notice/list.ts` | 静态公告 Demo；response 在 shared |
| `POST /admin/kick` | `admin/kick.ts` | 非核心强制下线参考，见 EXTRAFEATURES |
| `POST /pay/wx-notify` | `pay/wxNotify.ts` | 默认关闭的非核心参考，见 EXTRAFEATURES |

登录与选区由外部 WebPlatform Public API 提供，游戏服不挂兼容代理。Lobby 内的一问一答玩法数据使用
`../websocket/` RPC；HTTP 是否适合某个新功能仍应按缓存、鉴权和交互语义判断，不能只按目录惯例决定。

当前并非所有 method/path/request/response 都由 shared 统一登记：`ApiPath` 只有 `/healthz`，其他 path 仍
是 endpoint 字面量。新增核心 HTTP 契约时应补齐 shared path 与类型，再登记 router。带 body 的现有样例
使用 Zod，但普通 `z.object` 会剥离未知字段，且没有统一的应用层 body 大小上限。

完整 route matrix、限制和额外能力分类见
[`docs/SERVER.md §6`](../../../../docs/SERVER.md#6-http-开发边界) 与
[`docs/EXTRAFEATURES.md`](../../../../docs/EXTRAFEATURES.md)。
