# 外部身份服务：开发契约边界

> `gono-webplatform` 是独立代码库。本文件只说明 gameStarterKit 在本地开发中如何消费它的 HTTP
> 契约；完整项目边界见 [根 README](../README.md#项目边界)。

## 1. 定位

本仓通过精确锁定的 `@gono/webplatform-contract` 使用外部身份服务，目的只有两个：

1. 给本地 Demo 提供开发会话和区目录。
2. 让游戏服务端通过 HTTP 验证会话并登记角色存在性。

```text
Cocos 开发预览
  └─ HTTP → WebPlatform 开发 Public 接口

Game server 开发进程
  └─ HTTP → WebPlatform 开发 Internal 接口

gameStarterKit
  └─ 只消费 @gono/webplatform-contract
```

本仓不包含 WebPlatform 业务源码、账号表、migration 或进程内替代实现。

## 2. 数据所有权

| 数据 | 开发边界 |
| --- | --- |
| 开发账号与会话 | 外部身份服务 |
| 角色是否在某区存在 | 外部身份服务的目录索引 |
| 玩家玩法档、背包、货币示例 | 游戏仓 |
| 房间状态 | 游戏服务端内存与 shared Schema |

游戏库不能重新创建账号表，游戏源码不能 import 外部服务业务包。跨边界信息只通过契约化 HTTP
传输。

## 3. 本地使用的契约

路径常量来自契约包，调用方不得复制字符串。下列只是开发链中实际使用的语义摘要；字段真相以
锁定契约生成物为准。

### Public 开发接口

#### 创建开发会话

客户端提交开发 key 与所选区号，得到：

- `accessToken`
- `isNewAccount`
- `gameHttpUrl`
- `gameWsUrl`

开发 key 只用于本地示例。

#### 获取区目录

客户端读取可选择的开发区列表与当前账号的示例角色足迹，用于 AreaList 页面和本地连接选择。

### Internal 开发接口

#### 验证会话

LobbyRoom/GameRoom 把 token、serverId 和 strict 语义交给
`apps/server/src/platform/webPlatformClient.ts`，响应包含规范化 userId 与会话时间信息。

#### 角色存在性

游戏服在创建本地玩家档后登记角色存在性，并可查询某账号在某区是否已有角色。这个目录只表达
“存在/不存在”，不拥有玩法档案。

## 4. 契约同步

本仓锁定契约包版本、tarball integrity 与 manifest hash。

```bash
npm run sync:webplatform-contract
npm run verify:webplatform-contract
```

同步链：

```text
锁定的 contract package
  → apps/shared/src/generated/webplatform
  → apps/client/src/shared
  → apps/Cocos/assets/src/shared
```

生成目录禁止手改。契约发生变化时，应先更新锁定依赖，再运行同步并检查生成物 diff；外部仓如何
生成或交付该契约不属于本项目文档范围。

## 5. 客户端边界

- `portalUrl` 只是本地开发服务 origin。
- HTTP 请求通过 `core/http.ts`，业务封装放在 `net/http/`。
- 返回值在边界做运行时校验，再进入 session 或 area state。
- 请求失败必须显式显示开发错误或返回登录页，不能回退到游戏服内置账号逻辑。
- 客户端不得持有外部服务密钥或直接访问其数据库。

## 6. 服务端边界

- 只有 `platform/webPlatformClient.ts` 访问外部 Internal HTTP。
- Room/handler 不直接拼路径、header 或响应 shape。
- 连接、总超时、响应大小、错误映射和字段校验集中在 client adapter。
- 外部不可达与 token 无效是不同错误，不能混为一类。
- 角色登记失败可以通过本地 durable intent 样例重试，但不能回退为直写账号库。

## 7. 本地配置

开发时按外部仓说明提供与契约匹配的 Public/Internal 地址和本地服务身份。示例配置只服务于本地
联调，不是环境交付模板。

游戏仓不得出现：

- 外部账号数据库 DSN。
- 外部服务业务源码依赖。
- `ACCOUNT_MODE` 一类进程内/HTTP 双模式开关。
- 绕过 HTTP 的测试注入进入普通源码。

## 8. 本地测试

应覆盖：

- 开发会话成功与失败。
- 区目录 shape 校验。
- strict verify 成功、无效、超时和错误映射。
- 角色登记幂等。
- 外部返回缺字段、多字段、错误枚举或非法 URL 时在边界失败。
- 游戏数据库不包含账号表。
- 源码 import ban 已泛化为本仓源码边界检查。

## 9. 范围

这里记录的只有开发期 HTTP 接缝和代码所有权；完整项目边界见根 README。
