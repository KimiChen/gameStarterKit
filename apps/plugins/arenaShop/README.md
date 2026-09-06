# 竞技场商店插件（apps/plugins/arenaShop）

`arenaShop` 是 [docs/KIT.md](../../../docs/KIT.md) §8 点名的**建在 kit 上的插件样本**：它只消费 [`arena` kit](../../kits/arena/README.md)
的 `board` api 面（`plugin.json` 的 `requires: { kits: { arena: { board: 1 } } }`），自己不定义任何世界状态——「同一个商城在不同 kit 上
是不同的插件」的 v0 形态（KIT.md §4）。

## 玩家可见行为

- 设置面板「插件入口」列表出现「竞技场商店」（入口 id `arenaShop`，`launch.kind:"route"`，⛔ 不占首屏位）。
- 面板：列出**自己在竞技场占领的格**，每格一个「+守备（10 金）」按钮；成功显示 `→ 守备 N，余额 M`；失败按错误码翻译：
  `ARENA_SHOP_TILE_NOT_OWNED`（本域）/ `INSUFFICIENT_BALANCE`（shop 域所有的框架经济码）/ `STALE_FENCE`（core）/ 网络类——
  codegen 要求一个码只由一个域声明，本域 ⛔ 不重复声明后两者，它们仍经 `RPC_ERR_CODES` 全集到达客户端。
- 幂等：同一次点击的重试（`clientReqId` 重放）返回首次结果；越过 idem 缓存的重放由 kit-api 账本（同 opId `DUP`）保证不再扣款，
  此时响应 `balance` 为 `null`（kit 面不带余额，插件 ⛔ 不越过 kit 面读 `user_currency`），面板显示「重放：本次未扣款」并保留上次已知余额。

## 它怎么建在 kit 上

| 端 | 消费的 kit 面 | 消费方式 |
| --- | --- | --- |
| shared | `kits/arena/api/board`：`validateTileIndex`、`ARENA_MAX_POWER` | 域文件 `arenaShop.ts` 的 validator 复用 kit 的 tile 校验 |
| server | `kits/arena/api/board`：`boostTile` / `arenaOpId` / `ArenaTileNotOwnedError` | `core/arenaShop/buy.ts`：`currentZoneId()` 取区 → `withUser(uid)` 拿 fence（与 shop.purchase 同一写路径形态）→ `boostTile(uid, sId, fence, tile, ARENA_SHOP_BOOST_COST, opId)`；kit 错误翻译成本域 `ARENA_SHOP_TILE_NOT_OWNED`；余额只取 kit 面返回值（⛔ 不 import 框架经济模块，`arenaShop-buy.test.ts` 钉 import 集合） |
| client | `kits/arena/api/board`：`fetchArenaBoard` / `IArenaBoardRes` / `describeBoard` / `formatTile` | 棋盘只读经 `fetchArenaBoard(ports.lobbyRpc)`（⛔ 不自己 import kit 的 `arena` 域文件 / 点名 `ArenaRpc`——`arena.*` 的 wire 契约随 `api.board.version`，`requires.kits.arena.board` 的闸才覆盖到它）；商店逻辑用它过滤出自己的格并格式化 |

- ⛔ 不 import kit 内部模块（`boardRepo.ts` / `host.ts`），⛔ 不碰 `k_arena_*` 表，⛔ 不自建账本——扣款只发生在 kit-api 的 `tx.debit`；
- codegen 把 `arena` 自动并入本插件的 `dependencies`（kit 先装载），⛔ `dependencies` 里不直接写 kit id；
- `install` 正向闸：宿主没装 arena、或 arena 的 `board` 面 `[minSupported, version]` 不含 1 即拒装；arena 升级抬 `minSupported` 时
  反向闸点名本插件（`--break-dependents` 放行后 `check` 对本插件红）。

## 文件清单（全部落在 plugin.json 所有权推导出的 allowlist 内）

| 路径 | 角色 |
| --- | --- |
| `apps/plugins/arenaShop/plugin.json` | 身份（id / domains `["arenaShop"]` / `requires.kits`）+ 客户端登记：route `arenaShop` → View `ArenaShop`；menu 入口 |
| `apps/shared/src/protocol/lobbyRpc/domains/arenaShop.ts` | 域契约：`arenaShop.buyBoost` idempotent-write（`balance: number \| null`，contractVersion 2），errorCodes 一条，`ARENA_SHOP_BOOST_COST = 10` |
| `apps/server/src/core/arenaShop/buy.ts` | 用例（deps 可注入：假 kit 面 / 假 withUser 单测） |
| `apps/server/src/websocket/arenaShop/buyBoost.ts` | 端点：`defineRpc(ArenaShopRpc.BuyBoost)` |
| `apps/server/test/lobbyRpcVectors/arenaShop.ts` | 域向量 sidecar |
| `apps/server/test/arenaShop-buy.test.ts` | 服务端用例测试（假 kit 面） |
| `apps/client/src/plugins/arenaShop/index.ts` | plugin module：install 时把 ports 组装成 ArenaShopRuntime |
| `apps/client/src/plugins/arenaShop/logic/{ArenaShopLogic,arenaShopRuntime}.ts` | 纯 TS 逻辑（铁律 9） |
| `apps/client/src/plugins/arenaShop/view/ArenaShopView.ts` + `.view.json` | Cocos 纯节点页 + sidecar（owner `arenaShop`） |
| `apps/client/test/arenaShop-logic.test.ts` | 客户端逻辑测试 |
| `apps/plugins/arenaShop/README.md` | 本文 |

## 已知取舍（插件自身的后续版本，⛔ 不是框架承诺）

- **商品表只有一件**（boost），价格是域文件里的常量；真实商店需要配表与折扣，属于插件后续版本（递增 `version` 与域 `contractVersion`）。
- **余额只在购买后可见**：插件没有余额只读接口（宿主经济面尚未给插件开 query 门面），面板用最近一次购买返回的余额；账本重放
  （`balance: null`）不覆盖它。
- Cocos 镜像 `.meta` 由 Creator 生成（与 redeem 同口径），View 是纯节点手搓版。
