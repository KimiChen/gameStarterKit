# 点数赛插件（apps/plugins/tally）

[docs/PLUGIN.md](../../../docs/PLUGIN.md) §9.6 / [plan-v5.md](../../../plan-v5.md) E5 的**第二个真实插件样本**：`kinds: ["gameplay","plugin"]`，
用来证明 gameplay 形态（manifest/state/wire + 三端模块 + `<Constant>Room.ts` + wire 向量 sidecar + 入口）也能
「只加文件、不改中央源码」地 pack → 干净树 install → verify:all → Creator 预览。兑换码（`apps/plugins/redeem`）只证明了
plugin 形态。

## 规则

- 每个玩家一个 tap 按钮；每次 tap 服务端 +1；先到 `tapGoal`（缺省 10）者胜，房间进入 Settle。
- roster `min=1 / autoStart=1`：首人即开局，单人也能跑完一局（预览与实证用）。对局中有人离开，剩下的最后一人直接获胜。
- 客户端结算后停留 2 秒展示赢家，再经 `host.requestExit("settled")` 回大厅；「离开」按钮走 `user-exit`。

## 文件清单（全部在 plugin.json 推导出的 allowlist 内）

| 路径 | 角色 |
| --- | --- |
| `apps/plugins/tally/plugin.json` | 身份（id `tally`）+ 客户端登记：menu `tally` → `launch.kind:"gameplay"`；constantName `Tally` 从 gameplay/manifest.json 派生 |
| `apps/plugins/tally/gameplay/{manifest,state}.json` | 玩法单源（modeVersion 1、maxPlayers 4、profiles default） |
| `apps/shared/src/gameplays/tally/wire.ts` | `c2s.tally.tap`（无参数、Playing 期、rateCost 1） |
| `apps/server/src/rooms/modes/tally/index.ts` | GameMode：计数 / 结算 / 离开判胜 / rollback |
| `apps/server/test/wire-vectors/tally.ts` | wire 向量 sidecar（`codegen:gameplays` 汇入 `index.generated.ts`） |
| `apps/server/test/tally-game-mode.test.ts` | 规则测试 |
| `apps/client/src/gameplay/modes/tally/index.ts` | GameplayModule 装配（launch 校验、joiner、presentation 动态 import） |
| `apps/client/src/logic/rooms/tally/TallyGameplay.ts` | 纯 TS 玩法插件（铁律 9） |
| `apps/client/src/net/rooms/TallyRoom.ts` | adapter + joiner（`joinGameRoom` 复用，⛔ 不改 GameRoomTransport） |
| `apps/client/src/view/rooms/tally/TallyView.ts` + `.view.json` | Cocos 纯节点 presentation |
| `apps/client/test/tally-gameplay.test.ts` | 客户端插件测试 |
| `apps/plugins/tally/README.md` | 本文 |

生成物（wire-catalog / modeIds / catalog / GameRoomState 聚合 / per-mode state & schema / 客户端 catalog / 服务端
modes catalog / wire-vectors 登记表 / plugins 三产物）⛔ 不在包内，由 install 的 postinstall 链重生。

## 已知取舍

- 没有胜负奖励、没有 evidence 能力、不接经济系统。
- View 是纯节点手搓版（FGUI 编辑器不可用）；Cocos 镜像 `.meta` 为脚本合成占位（与 redeem 同口径）。
