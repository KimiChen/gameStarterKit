# platform/ — 账号/门户 plane 接缝

游戏服要访问账号平面（身份/token/角色注册表/撤销/选服目录）**一律走 `account.*`**。
契约与部署模式见 [docs/WEBPLATFORM.md](../../../../docs/WEBPLATFORM.md)、[DUAL_MODE §2.7](../../../../docs/DUAL_MODE.md)。

| 文件 | 职责 |
|---|---|
| `accountClient.ts` | `AccountClient` 接口 + 按 `ACCOUNT_MODE` 选实现（`in-process` / `http`） |
| `inProcessAccount.ts` | **内嵌实现**：直调 `@game/webplatform/lib`（与游戏服共库）；含 `verifySessionStrict`/`verifyBearer` |
| `httpAccount.ts` | **split 实现**：HTTP 指向 apps/WebPlatform；strict verify 后**懒填组 sess** |
| `inProcessLogin.ts` | 登录编排薄委托（**in-process 专用**；split 下客户端直连 WebPlatform，游戏服登录端点 404 门控） |

## ⚠ 本目录是 lib 直调的唯一合法处（除 `core/infra/mysql.ts` 的池注入）

split 下 lib 被注入**游戏服的池**，在别处直调 = 把账号平面的读写打在**组游戏库**上——
故障形态是**静默错误**（`affectedRows=0`、空集），不是报错。机检：`test/lib-import-ban.test.ts`。

## 踢在线不在本目录

撤销的**权威**由本接缝写（`account.ban/revoke`）；**踢**由 `core/auth/ban.ts` 在组侧发起
（`core/auth/kickBus.ts`：本节点即时 + 控制总线广播，best-effort）。**送达保证**在 GM 工具逐节点
`POST /admin/kick` 的 ack 确认（规则 09·G7b）。
