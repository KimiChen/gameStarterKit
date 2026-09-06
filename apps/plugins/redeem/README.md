# 兑换码插件（apps/plugins/redeem）

「兑换码」是 [docs/PLUGIN.md](../../../docs/PLUGIN.md) §6.1 点名的**插件标准形态**，本目录是它的首个真实实现，
同时充当 PLUGIN.md §9.6 / [plan-v5.md](../../../plan-v5.md) E5「第一个真实插件端到端实证」的样本：
作者侧在本仓内编写 → `plugin -- pack` 打包 → 干净树上 `plugin -- install` → `verify:all` 通过（当时两条既有
环境基线除外，根因与处置登记在 plan-v5「当前验证基线」；两条基线随后已在 `661e542`/`f731658` 闭合）。

## 玩家可见行为

- 设置面板「插件入口」列表出现「兑换码」（入口 id `redeem`，`launch.kind:"route"`，⛔ 不占首屏位）。
- 面板：一个输入框（trim + 大写）+「兑换」按钮 + 一行提示。成功显示 `+N 金币，余额 M`；
  失败按错误码翻译：`REDEEM_CODE_INVALID`（不存在）/ `REDEEM_CODE_USED`（该玩家已用过）/ 网络类。
- 幂等：同一次点击的重试（`clientReqId` 重放）返回首次结果；不同点击重兑同一码由服务端 Lua 原子拒绝。

## 文件清单（全部落在 plugin.json 所有权推导出的 allowlist 内）

| 路径 | 角色 |
| --- | --- |
| `apps/plugins/redeem/plugin.json` | 身份（id `redeem`、domains `["redeem"]`）+ 客户端登记：route `redeem` → View `Redeem`；menu 入口；`entry` 指向 plugin 自己的 index.ts |
| `apps/shared/src/protocol/lobbyRpc/domains/redeem.ts` | 域契约：`redeem.claim` idempotent-write，errorCodes 两条，contractVersion 1 |
| `apps/server/src/core/redeem/{codes,store,claim}.ts` | 码表（静态）/ Redis Lua 原子记账（`kPluginUser` 两键同槽）/ 用例 |
| `apps/server/src/websocket/redeem/claim.ts` | 端点：`defineRpc(RedeemRpc.Claim)` |
| `apps/server/test/lobbyRpcVectors/redeem.ts` | 域向量 sidecar（汇入 `index.generated.ts`） |
| `apps/server/test/redeem-claim.test.ts` | 服务端用例测试（内存 store + Lua 返回解析） |
| `apps/client/src/plugins/redeem/index.ts` | plugin module：install 时把 ports 组装成 RedeemRuntime |
| `apps/client/src/plugins/redeem/logic/{RedeemLogic,redeemRuntime}.ts` | 纯 TS 逻辑（铁律 9） |
| `apps/client/src/plugins/redeem/view/RedeemView.ts` + `.view.json` | Cocos 纯节点页 + sidecar（owner `redeem`） |
| `apps/client/test/redeem-logic.test.ts` | 客户端逻辑测试 |
| `apps/plugins/redeem/README.md` | 本文 |

生成物（registry/plugins/views/fguiContracts/vectors index/plugins.generated.md、shared→client 镜像、
client→Cocos 镜像）⛔ 不在包内，由 install 的 postinstall 链在宿主仓重生。

## 已知取舍（插件自身的后续版本，⛔ 不是框架承诺）

- **码表是进程内静态表**（`core/redeem/codes.ts`）。真实运营需要运营后台/DB 码表、有效期、总量与批次。
- **奖励只入本 plugin 钱包**（`ft:redeem:wallet:{uid}`），⛔ 不碰经济系统主钱包/账本：插件只能消费框架 API，
  不能改框架写路径（PLUGIN.md §3）。接入主钱包属于框架侧开放能力（需要一条受治理的经济写 API），未实施。
- **Cocos 镜像 `.meta` 是脚本合成的占位**（与 eacb687 先例同口径），Creator 打开工程时会按需重写；
  作者侧 FGUI 编辑器不可用，故 View 是纯节点手搓版。
