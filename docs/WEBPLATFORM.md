# 外部身份服务：开发契约边界

> `gono-webplatform` 是独立代码库。本文只说明 gono 在本地开发中如何消费其锁定 HTTP 契约；
> 渠道登录、账号管理等生成契约中的额外 operation 见
> [EXTRAFEATURES](EXTRAFEATURES.md)，不属于核心框架承诺。

## 1. 定位

核心开发链只需要：

1. 客户端通过 Public HTTP 创建开发会话并读取区目录。
2. 游戏服务端通过 Internal HTTP 验证会话、登记和查询角色存在性。

```text
Cocos 本地预览
  └─ HTTP → WebPlatform Public 开发接口

Game server 本地进程
  └─ HTTP → WebPlatform Internal 开发接口

gono
  └─ 只消费精确锁定的 @gono/webplatform-contract
```

本仓不包含 WebPlatform 业务源码、账号表、migration 或进程内账号实现，也不生成或交付外部服务。

## 1.1 dev 例外（2026-09-02 拍板）

本地开发可以不启动 WebPlatform：`AUTH_PROVIDER=dev`（非生产缺省）会安装进程内开发身份提供者
（`apps/server/src/platform/devAuthProvider.ts`）——会话形状、组 sess 缓存、MySQL 角色登记
与真链路逐语义一致，并复刻锁定契约的 `/v1/sessions/dev` 与 `/v1/areas` 路径形状
（`apps/server/src/http/devPublic.ts`）。此时客户端 `portalUrl` 留空即回落到游戏服自身端口
（`Main.portalUrl` 或 `bootstrap` 的 `DEV_SERVER_URL` 回落）。

⛔ 这是唯一的进程内例外：`AUTH_PROVIDER=dev` + `NODE_ENV=production` 启动期拒启；生产环境的
真实身份、封禁/撤销与多区目录仍只属于外部 WebPlatform，dev 实现不模仿这些账号语义。

## 2. 数据所有权

| 数据 | 当前所有者 |
| --- | --- |
| 开发账号、账号状态与会话 | 外部 WebPlatform |
| 某账号在某区是否存在角色 | 外部 WebPlatform 的目录索引 |
| 玩家玩法档、背包、货币 Demo | gono 游戏数据层 |
| 房间状态 | 游戏服务端内存与 shared Schema |

游戏库不能重新创建账号表，游戏源码不能 import 外部服务业务包。跨边界信息只通过契约化 HTTP 传输。

## 3. 核心开发链实际使用的契约

路径常量来自生成物 `WebPlatformPath`，字段真相来自锁定的 `types.generated.ts`。`WebPlatformMethod`
目前只被服务端 Internal 客户端（`platform/webPlatformClient.ts`）消费，客户端 Public 调用的 method
仍是 `net/http/account.ts`、`net/http/area.ts` 里的字面量。下列是当前代码实际消费的摘要。

### Public：创建开发会话

客户端 `POST /v1/sessions/dev`，请求：

```ts
{ devKey: string; serverId: number; deviceId?: string | null }
```

响应只有：

```ts
{ accessToken: string; isNewAccount: boolean; userId: string }
```

`gameHttpUrl` 与 `gameWsUrl` 不在登录响应里。开发 key 只用于本地示例。

### Public：读取区目录

客户端 `GET /v1/areas`，已有 token 时自动携带 Bearer。响应包含：

- `hash`、`isOps`、`myServerIds`。
- `servers[]`；每项包含 `serverId`、`name`、`status`、`tag`、`openTime`、`gameHttpUrl`、
  `gameWsUrl`。

游戏连接地址来自所选 `servers[]` 项，不能从 dev-login 响应猜测。

### Internal：验证会话

LobbyRoom/GameRoom 经 `platform/webPlatformClient.ts` 发送：

```ts
{ accessToken: string; serverId: number }
```

成功响应是 `{ valid: true, userId, issuedAtMs }`；失败响应是 `{ valid: false, reason }`，其中 reason
受生成契约枚举约束。只有 `valid:false` 属于玩家身份结论；网络、超时、5xx、服务身份错误或非法响应
不能伪装成 token 无效。

### Internal：角色存在性

游戏服对 `/v1/internal/characters/{userId}/{serverId}` 使用幂等 PUT 登记，并用 GET 查询。该目录只表示
“存在/不存在”，不拥有或返回玩法档案。

生成契约还包含核心开发链未使用或只作为额外参考的 operation。生成物存在不等于本仓已经实现对应业务；
范围统一见 EXTRAFEATURES。

## 4. 契约同步

本仓锁定契约包版本、tarball integrity 与 manifest hash：

```bash
npm run sync:webplatform-contract
npm run verify:webplatform-contract
```

`npm run dev:client` 启动时也会执行同一次契约同步（删除并重写 `apps/shared/src/generated/webplatform`），
本地开发过程中该目录可能被自动刷新。

同步链：

```text
vendor/gono-webplatform-contract-*.tgz
  → apps/shared/src/generated/webplatform
  → apps/client/src/shared
  → apps/Cocos/assets/src/shared
```

生成目录禁止手改。变更时先更新锁定依赖，再运行同步、检查 diff，并更新本仓消费代码和本地测试。
外部仓如何生成和交付契约不属于本项目文档范围。

## 5. 客户端边界

当前实现：

- `Main.portalUrl` 初始化独立 Public origin；空值或非 http(s) 绝对地址立即失败，不回退游戏服 URL。
- `net/http/account.ts` 使用生成路径封装 dev session；`net/http/area.ts` 封装区目录。
- `core/http.ts` 统一 XHR、10 秒超时、Bearer 和结构化 `HttpError(status, code)`。
- 非 2xx、网络失败、超时或非 JSON 2xx 会 reject。

Public response 现在通过 shared `WebPlatformHttpContractMap` 在 `core/http.ts` 的统一 `portalRequest`
边界做 exact/range/URL runtime validation；`devLogin`、`wxLogin` 与 `fetchAreaList` 只传 contract key
对应的 method/path，非法字段、缺字段、多字段或非法 origin 会在进入 session/area logic 前 reject。
服务端 Internal verify/register/has 仍在 `platform/webPlatformClient.ts` 额外包一层错误分类，便于区分玩家
身份失败、服务不可用和契约损坏。

客户端不得持有 Internal 服务密钥或访问外部数据库。业务失败应显示开发错误或回到登录/选区流程，不能
回退到游戏服内置账号逻辑。

## 6. 服务端边界

`apps/server/src/platform/webPlatformClient.ts` 是游戏服访问 Internal HTTP 的唯一入口。它当前提供：

- keep-alive HTTP/HTTPS agent、独立建连与总超时、64 KiB 响应上限。
- 网络类失败和 502/503 的一次有限重试，共享同一总预算与 request ID。
- 连续基础设施失败熔断与单探针 half-open。
- verify/register/has 三类 2xx 响应的 exact-key runtime validation。
- 传输不可用、服务/调用配置错误、契约 shape 错误与玩家身份失败的不同异常类型。
- 停止时销毁 keep-alive agent 的 `closeWebPlatformClient`。

Room/handler 不直接拼 Internal path、header 或响应 shape。每次 Lobby/GameRoom 建连使用 strict HTTP
verify；Lobby 每消息只复核本地 Redis session cache，不逐消息回源。角色登记失败会尝试写本地 durable intent，
若 intent 写入也失败则抛出聚合错误；成功持久化的 intent 由默认开发进程中的 repair loop 重试。这仍是
本地补偿样例，不改变外部服务的数据所有权。

## 7. 测试替身边界

普通运行时默认 delegate 始终是 HTTP client，不存在 `ACCOUNT_MODE` 或 in-process 账号模式。

源码确实导出了 `installWebPlatformClientForTests`：它只用于无头测试替换三个 Internal 调用，要求逆序恢复，
并在 `NODE_ENV=production` 时直接拒绝安装。文档应允许这一显式 test seam，不能写成“普通源码内完全没有
测试注入”；真正的红线是把它演化为运行期模式开关或业务 fallback。

## 8. 本地配置

游戏服务端从根 `.env.development` 或显式环境变量读取：

- `WEBPLATFORM_INTERNAL_URL`
- `WEBPLATFORM_SERVICE_ID`
- `WEBPLATFORM_SERVICE_SECRET`
- connect/request timeout 与 breaker 参数

Public URL 由客户端场景配置。游戏仓不得出现外部账号数据库 DSN、外部业务源码依赖或进程内账号替代实现。
这些值只用于本地联调，不是环境交付模板。

## 9. 本地测试现状

- `apps/server/test/webplatform-client.test.ts` 覆盖 Internal header、路径编码、重试、超时、错误分类和
  exact-key response validation；它把 `WEBPLATFORM_BREAKER_FAILURES` 设为 100 以关闭熔断，因此熔断阈值、
  half-open 单探针和探针成功/失败后的状态复位当前没有本地测试覆盖。
- `apps/client/test/httpStatus.test.ts` 覆盖 Public origin、method/path/body、Bearer、状态码、非 JSON 和
  success response runtime shape validation（缺字段、未知字段、非法 URL/枚举）。
- `apps/server/test/smoke.ts` 需要外部 Public/Internal 与运行中的游戏服，覆盖真实拆分链路；其中额外账号
  operation 与 kick 不属于核心开发验收。
- 游戏库不得包含账号表，由 `smoke:framework` 和相关源码边界测试检查。

新增或修改契约消费时，至少补齐成功、失败、超时、错误枚举、缺字段、多字段、非法数值/URL 与服务错误
的本地测试；不能只依赖 TypeScript 类型。

## 10. 范围

本文只记录开发期 HTTP 接缝与代码所有权。总体边界见[根 README](../README.md#项目边界)，额外 operation
及其非承诺说明见 [EXTRAFEATURES](EXTRAFEATURES.md)。
