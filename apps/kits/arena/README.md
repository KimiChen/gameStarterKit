# 竞技场 kit（apps/kits/arena）

`arena` 是 [docs/KIT.md](../../../docs/KIT.md) §8 点名的**首个 kit 样本**（K0-5）：一张 per-zone 的 SQL 世界棋盘 + 两个玩法 mode
（`arenaCapture` 占领赛 / `arenaDuel` 决斗）+ 两个 api 面（`board` / `ranking`）+ 一个建在 `board` 面上的插件
[`arenaShop`](../../plugins/arenaShop/README.md)——这四样正好覆盖 kit 相对插件多出来的全部机制（SQL 账本、多 mode 身份、
api 命名面、`requires.kits`）。走通的动线：作者侧 `plugin -- pack arena` → 干净树 `plugin -- install` → codegen → `db:bootstrap`
应用迁移 → `plugin -- install arenaShop.zip`（正向闸）→ `plugin -- check` / `plugin -- test arena` → `uninstall`（依赖反查）。

## 定义了什么

| 面 | 内容 |
| --- | --- |
| 世界状态（SQL） | `k_arena_board(server_id, tile, owner_uid, power, updated_at)`，per-zone（`server_id` 进主键）；16 格（4×4），`owner_uid=''` 无主 |
| 占领回执（SQL） | `k_arena_attempt(server_id, op_id, uid, tile, outcome, power, owner_uid, created_at)`，per-zone，`(server_id, op_id)` 主键——`arena.capture` 每个 opId 一行，重放只回读（kit 自己的幂等账本） |
| 玩法 | `arenaCapture`：每次 capture +1，先到 `captureGoal`（缺省 5）者胜；`arenaDuel`：2 人，每次 strike 让自己 `hits` +1，先到 `hp`（缺省 3）者胜。都是 tally 形态（min=1/autoStart=1，单人可跑完一局） |
| Lobby RPC 域 `arena` | `arena.board`（query）：整张棋盘 + 本人奖杯；`arena.capture`（idempotent-write）：占领 / 加固 / 夺取一格；errorCodes `ARENA_TILE_TAKEN` |
| per-user 键 | `kt:arena:stats:{uid}` HASH（`userKeys:["stats"]`，冷档随 freeze/thaw 快照），字段 `trophies` |
| effect kind | `kit:arena:trophy`（`effects.trophy`：对 `stats.trophies` 累加，delta ∈ [1, 1000000]）——奖杯的**唯一**写路径 |
| 客户端 | 棋盘页 route `arena`（View `ArenaBoard`，纯节点手搓版）+ 三个菜单入口（棋盘 / 占领赛 / 决斗） |

## 棋盘规则（`apps/shared/src/kits/arena/api/board/index.ts` 抬头是同一真源）

- 无主格任何人可占：占领后 `power = 1`，改主 ⇒ +1 奖杯；
- 自己的格再占一次 = 加固：`power + 1`（上限 `ARENA_MAX_POWER = 99`），不发奖杯；
- 别人的格 `power > 0` 时不可占（`ARENA_TILE_TAKEN`），但**每次尝试让它 `power − 1` 并提交**；归零后可被夺取（改主、`power = 1`、+1 奖杯）；
- **同一 opId（= 同一 clientReqId）只算一次尝试**：三种结果都写回执 `k_arena_attempt`，重放（越过 dispatcher 60s 的 idem 结果缓存、
  或结果缓存不可得）原样回读——`taken` 不再削守备、`reinforced` 不再 +1、`captured` 不再入队奖杯；
- 商店 boost（`boostTile`）：只对自己的格，扣 `cost` 金币后 `power + 5`（封顶）；
- 守备值在数据出口钳到 `ARENA_MAX_POWER`（列是 `INT UNSIGNED` 无 CHECK：一行越界不让整张棋盘的响应 validator 失败）。

## 插件怎么用 api 面

| 面 | shared | server | client |
| --- | --- | --- | --- |
| `board` v1 | `IArenaTile`、`ARENA_TILE_COUNT/ARENA_MAX_POWER/ARENA_BOOST_POWER`、`validateTileIndex`、`canCaptureTile`、`fillArenaBoard` | `readBoard(sId)`、`captureTile(uid,sId,tile,opId)`、`boostTile(uid,sId,fence,tile,cost,opId)`、`arenaOpId(...)`、`ArenaTileNotOwnedError` | `fetchArenaBoard(lobbyRpc)`（读 `arena.board`）、`describeBoard`、`tileLabel`、`formatTile`、`ARENA_GRID_SIZE` … |
| `ranking` v1 | `rankTiles`、`rankOwners` | `topOwners(sId, limit)` | `formatRanking` |

- 插件只能 import `apps/{shared,server,client}/src/kits/arena/api/<surface>/index.ts`（服务端 / shared 用
  `@game/shared/kits/arena/api/<surface>/index` 与 `../../kits/arena/api/<surface>/index`，客户端相对路径），⛔ 不得 import
  `boardRepo.ts` / `host.ts` 这类内部模块；
- 在 `plugin.json` 写 `requires: { kits: { arena: { board: 1 } } }`，codegen 把 arena 并入插件的 `dependencies`（kit 先装载），
  ⛔ 不在 `dependencies` 里直接写 `arena`；
- 任一面的导出变化 ⇒ bump `kit.json.api.<surface>.version`；破坏性变化再抬 `minSupported`（`install` 的反向闸会点名受影响插件）；
- **`arena` RPC 域的 wire 契约属于 `board` 面**：插件 ⛔ 不自己点名 `ArenaRpc.*`，读棋盘只经客户端 board 面的 `fetchArenaBoard`
  （类型 `IArenaBoardRes` 也从该面再导出）——`domains/arena.ts` 任何变化都要 bump `api.board.version`，`requires.kits.arena.board`
  的闸才真的覆盖到插件消费的 RPC 形态。

## 账本与 effect（docs/KIT.md §4/§5 的机制实证）

- **SQL 只经 `withKitTx("arena", sId, tx => tx.query(...))`**（表闸：只放行 `k_arena_*`）；表由 `db:bootstrap` 按 `kit_migration`
  账本应用 `sql/001-init.sql`，`install` 不碰数据库；`uninstall` 保留表，`--drop-data` 才 drop；
- **扣款只经 `tx.debit(uid, CUR_GOLD, cost, fence, opId, "arena.boost")`**（经济主账本，ledger UNIQUE 幂等：同 opId 二次 = `DUP`，
  kit 不再加守备、`balance` 为 null 原样交给插件——插件 ⛔ 不越过 kit 面读余额）；本 kit 没有第二套货币账本；
- **奖杯只经 `tx.enqueueEffect(uid, opId, { grants: [{ kind: "kit:arena:trophy", delta: 1 }] })`**——与棋盘写 + 回执写同一事务；
  事务提交后经 kit-api 的 `applyKitEffect` 立即走阶段 2/3（`redisApply` + `markOutboxDone`，best-effort，与 shop.purchase 同形），
  所以 `npm run dev`（不起 relayer）下 `arena.capture` 返回的 `trophies` 已含本次 +1；失败 / 冷档留给 relayer 收敛
  （`APPLY_EFFECT` 的 kit 分支满足冷档写侧契约）；kit 服务端代码 ⛔ 从不 HSET `kt:arena:*`；
- **幂等在 kit 自己的表**：`captureTile` 事务内先加锁读 `k_arena_attempt`，有回执即原样回读（零写入、不再入队 / apply effect）；
  「outbox 已有同 opId intent 却无回执」不可能由本 kit 写路径产生 ⇒ 视为账本不一致抛出回滚（fail-closed）；同 opId 并发到达时
  第二个事务写回执撞主键即回滚；
- `arena.board` / `arena.capture` 返回的奖杯数是 kit-api `readKitUserField("arena","stats",uid,"trophies")` 的只读 HGET
  （`name` 必须在 `kit.json.userKeys` 里）；`arena.board` 读到的是已 apply 的值。

## 文件清单（全部落在 kit.json 所有权推导出的 allowlist 内）

| 路径 | 角色 |
| --- | --- |
| `apps/kits/arena/{kit.json,README.md,sql/001-init.sql,gameplays/<modeId>/{manifest,state}.json}` | 单源 |
| `apps/shared/src/kits/arena/api/{board,ranking}/index.ts` | shared api 面（零依赖） |
| `apps/shared/src/protocol/lobbyRpc/domains/arena.ts` + `apps/server/test/lobbyRpcVectors/arena.ts` | 域契约 + 向量 sidecar |
| `apps/shared/src/gameplays/{arenaCapture,arenaDuel}/wire.ts` + `apps/server/test/wire-vectors/{arenaCapture,arenaDuel}.ts` | 两个 mode 的 wire 与向量 |
| `apps/server/src/kits/arena/{boardRepo,host}.ts` | 内部模块：SQL 访问（棋盘 + 回执）/ 宿主接线（`currentZoneId` + 只读奖杯，都经 kit-api 门面；本 kit 服务端代码只 import `../../core/infra/kitApi`、本目录与 `@game/shared*`——`apps/server/test/kit-import-boundary.test.ts` 钉住） |
| `apps/server/src/kits/arena/api/{board,ranking}/index.ts` | 服务端 api 面（`withKitTx` / `tx.debit` / `tx.enqueueEffect` / `applyKitEffect` / `kitOpId`） |
| `apps/server/src/websocket/arena/{board,capture}.ts` | 端点 |
| `apps/server/src/rooms/modes/{arenaCapture,arenaDuel}/index.ts` | 两个 GameMode |
| `apps/client/src/kits/arena/{index.ts,api/**,logic/**,view/ArenaBoardView.ts+.view.json}` | kit module / client api 面 / 棋盘页 |
| `apps/client/src/{gameplay/modes,logic/rooms,view/rooms}/{arenaCapture,arenaDuel}/**` + `apps/client/src/net/rooms/{ArenaCapture,ArenaDuel}Room.ts` | 两个 mode 的客户端四件 |
| `apps/server/test/{arena-board,arena-sql,arenaCapture-game-mode,arenaDuel-game-mode}.test.ts`、`apps/client/test/{arena-board-logic,arenaCapture-gameplay,arenaDuel-gameplay}.test.ts` | 测试（`plugin -- test arena` 按锁枚举） |

生成物（gameplay / plugin 两套 codegen 的产物、kit catalog 双端、shared→client 镜像、client→Cocos 镜像）⛔ 不在包内，由 install 的
postinstall 链在宿主仓重生。

## 已知取舍（kit 自身的后续版本，⛔ 不是框架承诺）

- **敌格削守备在拒绝响应（`ARENA_TILE_TAKEN`）里提交**：这是玩法规则（每次尝试削 1 点），不是缺陷——重放由回执表挡住，
  ⛔ 不会被同一 clientReqId 的重试重复提交；真正的第二次尝试要换 clientReqId；
- **回执表不做保留期裁剪**（每次 capture 一行、永不删）：样本接受；真实 kit 应加 compute 任务按 `created_at` 裁掉早于
  idem 结果窗口很久的行（`idx_created`），或改成按 (uid, tile) 的计数表；
- 阶段 2/3 是 best-effort：`applyKitEffect` 失败 / 冷档时 `arena.capture` 返回的 `trophies` 尚未含本次 +1，relayer 收敛后
  「刷新」即可看到；
- Cocos 镜像 `.meta` 由 Creator 生成（与 redeem 同口径），作者侧无 FGUI 编辑器，View 是纯节点手搓版。
