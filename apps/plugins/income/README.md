# income —— 铜币收益（在线结算 + 离线收益弹窗）

规则与账本**都不在这里**：真源是 `apps/serverNew/server/src/modules/income/IncomeLedger.ts`
与 income 模块自己的 Redis 账户。本插件只是它的客户端面。

## 三条 wire 路由（`apps/shared/src/protocol/lobbyRpc/domains/income.ts`）

| 路由 | 模式 | 谁触发 |
| --- | --- | --- |
| `income.getPending` | query | 登录后 / 手动打开弹窗 |
| `income.settleOnline` | natural-write | 帧累计满 5 秒的心跳（客户端轮询） |
| `income.claimOffline` | idempotent-write | 弹窗「确定」 |

## 非显而易见的约束

- **新账号自动建收益账户**：原生 Lobby 首次认证在 `nativeLobby:income:account:v1` 原子创建
  1 级 / 0 铜币账户；等级、铜币和收益时间轴都在这份账户内，⛔ 不读取旧通道 `User` Bean。
- **离线收益不由登录自动发放**：`ActionEnter`（旧通道）/ income 模块的 `onAuthenticated`
  （原生 Lobby）只把离线那段**算好暂存**在 `User.offlineCopperPending`，必须客户端显式
  调 `income.claimOffline` 才进 `copper`。⛔ 别在服务端加回「登录即到账」。
- **在线结算靠客户端心跳**：服务端没有定时器，`settleOnline` 不来就不入账；帧累计到 5 秒
  才发一次，⛔ 不要改成每帧发。
- **自动弹窗走宿主 placement**：`apps/plugins/host.json` 的 `autoStart` 声明本插件在
  session 建立后自动装载（`resident: true` 保证不被 route refcount 拆掉）。
  ⛔ 不要为「登录后弹窗」往 `apps/client/src/app/**` 里加玩法分支。
- **弹窗内容只左对齐一次**：正文/余额/提示的 host 保持在面板中心，内部 Label 再以
  `-contentWidth / 2` 定位左边缘；⛔ host 与 Label 同时左移，否则文字会落到面板裁剪区外。
