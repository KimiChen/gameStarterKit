# income —— 铜币收益（在线结算 + 离线收益弹窗）

规则与账本**都不在这里**：真源是 `apps/serverNew/server/src/modules/user/action/CopperIncome.ts`
（不持有存储的纯规则类）+ `User` Bean 的字段（`copper`、`lastCopperIncomeTime`、
`offlineCopperPending`、`offlineCopperSecondsPending`）。本插件只是它的客户端面。

## 三条 wire 路由

声明真源是 `apps/shared/schema/protocols/C2S/income.json`；Action 由 `pnpm generate` 生成，
⛔ 不手写路由文件。

| 路由 | 模式 | 谁触发 |
| --- | --- | --- |
| `income.getPending` | query | 登录后 / 手动打开弹窗 |
| `income.settleOnline` | natural-write | 帧累计满 5 秒的心跳（客户端轮询） |
| `income.claimOffline` | idempotent-write | 弹窗「确定」 |

## 非显而易见的约束

- **收益账户就是 `User` Bean**：等级读 `User.lv`，铜币写 `User.copper`，时间轴是
  `User.lastCopperIncomeTime`。⛔ 不要另起一套 Redis 账户或第二份账本。
- **income Action 不处理缺失的 `User`**：原生 Lobby 在认证成功前会先完成玩家建档，业务
  Action 直接使用 `this.user`。加载不到档案属于认证/建档链异常，必须让执行失败并暴露问题，
  ⛔ 不要用零收益、零余额或静默返回伪装成成功响应。
- **离线收益不由登录自动发放**：`ActionEnter`（旧通道）/ income 模块的 `onAuthenticated`
  （原生 Lobby）只把离线那段**算好暂存**在 `User.offlineCopperPending`，必须客户端显式
  调 `income.claimOffline` 才进 `copper`。⛔ 别在服务端加回「登录即到账」。
- **三个内部字段是 `@OnlyRedis`，永远不上网**：`lastCopperIncomeTime` /
  `offlineCopperPending` / `offlineCopperSecondsPending` 只落 Redis；客户端能看到的余额
  只有 `copper`。这条由 `test/runtime/protocol/only-redis-fields-off-the-wire.test.ts`
  对着生产 `User` Bean 的真实装配钉住。
- **在线结算靠客户端心跳**：服务端没有定时器，`settleOnline` 不来就不入账；帧累计到 5 秒
  才发一次，⛔ 不要改成每帧发。
- **客户端余额取统一模块状态**：`IncomeLogic.balance()` 先读 `lobbyDataSync` 里的 `copper`
  （由 `reply.sync` / 主动 sync 送进来），RPC 回执只用于「本次领取」的展示与确认，
  快照只是同步尚未到位时的兜底。⛔ 不要在 Logic 里自己加账 —— 那样只会与服务端口径分叉。
- **自动弹窗走宿主 placement**：`apps/plugins/host.json` 的 `autoStart` 声明本插件在
  session 建立后自动装载（`resident: true` 保证不被 route refcount 拆掉）。
  ⛔ 不要为「登录后弹窗」往 `apps/client/src/app/**` 里加玩法分支。
- **弹窗内容只左对齐一次**：正文/余额/提示的 host 保持在面板中心，内部 Label 再以
  `-contentWidth / 2` 定位左边缘；⛔ host 与 Label 同时左移，否则文字会落到面板裁剪区外。

## 已删除的第二套框架 + 残留数据处理

income 曾经自带独立账户与手工路由。BF7 已整件删除 `IncomeNativeLobbyRoutes.ts`、
`IncomeNativeLobbyStore.ts`、`IncomeAccount.ts`（`IncomeLedger` 的职责已并入
`CopperIncome`），余额统一落到 `User` Bean。运行时代码里已没有任何读写
`nativeLobby:income:account:v1` 的路径，并有门禁钉住（`framework-gates.test.ts` 的
「keeps the income Action chain on the Bean lifecycle」）。

那份旧 Redis 哈希**是无用的开发数据**：不迁移、不兼容、不写运行时 fallback、不双读双写。

```bash
# 旧开发环境的显式清理（按实际库号执行；执行前确认该键确实只来自旧实现）
redis-cli -n <db> DEL nativeLobby:income:account:v1
```

⛔ 不要写迁移脚本把旧账户折算进 `User.copper`：旧数据只存在于开发期，而折算规则一旦写错
就是给正式账号凭空加币。宁可让开发环境从 `User` Bean 重新开始。
