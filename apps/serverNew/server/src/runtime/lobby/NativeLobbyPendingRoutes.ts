/**
 * 原生通道**尚未迁移**的 shared lobbyRpc 路由登记表。
 *
 * 为什么需要这张表：`apps/shared` 的 lobbyRpc registry 是**两代服务端共有**的 wire 面 —— 迁移目标
 * （本项目）拥有其中一部分，另一条在飞的产品线（MMO：chat / party / world）在 `apps/server` 上实现
 * 并把域加进同一份声明面。因此「shared 声明了 N 条」**不等于**「原生通道应该实现 N 条」，
 * 启动期的全集闸不能直接拿声明面当期望集（否则 MMO 每加一个域，原生通道就断一次）。
 *
 * 语义（由 `NativeLobbyRouteRegistry.assertComplete` 实现）：
 *  - 注册面 ⊆ 声明面（多出来的 handler 一定是路由名写错）；
 *  - 声明面 ∖ 注册面 ⊆ 本表（少一条就必须在这里有登记，且必须写清原因）；
 *  - 本表 ⊆ 声明面 ∖ 注册面（**双向对齐**：路由迁走（已注册）或从 shared 删除（不在声明面）
 *    都会让本表陈旧 ⇒ 直接 fail，强制同批删掉这一行）。
 *
 * ⛔ 本表登记的是**归属**，不是「先欠着」：新增一条之前先确认该路由确实属于另一条产品线；
 * 迁移落地时必须**同批**删掉对应行，否则启动会红。
 * ⛔ 不要把「本项目该实现但还没实现」的路由登记进来换启动通过 —— 那是把启动期 fail-fast
 * 换成永久静默，正是这张表存在的理由被误用。
 */

/** MMO MF6a-B3（e4f9f692）：`apps/server` 的 `core/party` + `websocket/party/*`，原生通道无 party 模块。 */
const MMO_PARTY_REASON = 'MMO MF6a-B3（e4f9f692）：party 域仅在 apps/server 实现，原生通道未迁移'

/**
 * MMO MF8-B4（73716dac）/ MF10-B1（76ae49ff）：`apps/server` 的 `core/world` + `websocket/world/*`。
 *
 * ⚠ 这条比 party 更重：`world.enter` 依赖 persona（MF2）、`world_instance` 表、`controlEpoch`、
 * `WorldRegistry` 分线分配与 Colyseus `WorldRoom`，而原生通道这几样**一样都没有**（`WorldRoom` 在
 * 本项目里没有承载物）。因此它不是「补一条 handler」能解决的，见 `humanDocs/协议模块调整.md` §7。
 */
const MMO_WORLD_REASON =
    'MMO MF8-B4（73716dac）/ MF10-B1（76ae49ff）：world 域依赖 persona / WorldRoom / world_instance，原生通道未迁移'

const LEGACY_ARENA_REASON =
    'arena kit 与 arenaShop plugin 的权威实现位于 apps/server（kits/arena、core/arenaShop、websocket/arena*）；serverNew 不保留重复 Redis 棋盘与商店实现'

const LEGACY_SLG_REASON =
    'slg kit 的权威实现位于 apps/server（kits/slg、websocket/slg）；serverNew 不保留重复 Redis 大地图与行军实现'

const LEGACY_GUILD_REASON =
    'guild 域的权威实现位于 apps/server（core/guild、websocket/guild）；serverNew 不保留重复 Redis 公会实现'

const LEGACY_MAIL_REASON =
    'mail 域的权威实现位于 apps/server（core/economy、websocket/mail）；serverNew 不保留重复 Redis 信箱与附件发放实现'

const LEGACY_ROOM_REASON =
    'room 私房票据的权威实现位于 apps/server（core/rooms、websocket/room）；serverNew 不保留重复 Redis ticket 实现'

const LEGACY_SHOP_REASON =
    'shop / redeem 经济权威位于 apps/server（core/economy、core/redeem、websocket/shop|redeem）；serverNew 不保留重复 Redis 钱包与发放实现'

const LEGACY_SNAKE_COSMETIC_REASON =
    'snakeCosmetic 的权威实现位于 apps/server（websocket/snakeCosmetic）；serverNew 不保留重复 Redis 衣柜实现'

const LEGACY_USER_REASON =
    'user Lobby 域的权威实现位于 apps/server（websocket/user）；serverNew 只保留内部 User Bean 建档与生命周期，不保留第二套 Redis profile'

export const NativeLobbyPendingRoutes: Readonly<Record<string, string>> = {
    'arena.board': LEGACY_ARENA_REASON,
    'arena.capture': LEGACY_ARENA_REASON,
    'arenaShop.buyBoost': LEGACY_ARENA_REASON,
    'chat.send': 'MMO MF6a-B4（1280037e）：chat 域（realm / party 频道）仅在 apps/server 实现，原生通道未迁移',
    'guild.getEvents': LEGACY_GUILD_REASON,
    'guild.join': LEGACY_GUILD_REASON,
    'guild.leave': LEGACY_GUILD_REASON,
    'mail.claimAttach': LEGACY_MAIL_REASON,
    'mail.list': LEGACY_MAIL_REASON,
    'mail.markRead': LEGACY_MAIL_REASON,
    'party.create': MMO_PARTY_REASON,
    'party.invite': MMO_PARTY_REASON,
    'party.accept': MMO_PARTY_REASON,
    'party.decline': MMO_PARTY_REASON,
    'party.leave': MMO_PARTY_REASON,
    'party.kick': MMO_PARTY_REASON,
    'party.transferLeader': MMO_PARTY_REASON,
    'party.get': MMO_PARTY_REASON,
    'party.getEvents': MMO_PARTY_REASON,
    'redeem.claim': LEGACY_SHOP_REASON,
    'room.prepareCreate': LEGACY_ROOM_REASON,
    'room.resolve': LEGACY_ROOM_REASON,
    'shop.purchase': LEGACY_SHOP_REASON,
    'shop.queryOp': LEGACY_SHOP_REASON,
    'slg.mapTiles': LEGACY_SLG_REASON,
    'slg.tileCapture': LEGACY_SLG_REASON,
    'slg.marchDispatch': LEGACY_SLG_REASON,
    'slg.marchRecall': LEGACY_SLG_REASON,
    'snakeCosmetic.getSnapshot': LEGACY_SNAKE_COSMETIC_REASON,
    'snakeCosmetic.equip': LEGACY_SNAKE_COSMETIC_REASON,
    'snakeCosmetic.unlock': LEGACY_SNAKE_COSMETIC_REASON,
    'user.getInfo': LEGACY_USER_REASON,
    'user.getProfile': LEGACY_USER_REASON,
    'user.getUserId': LEGACY_USER_REASON,
    'user.updateProfile': LEGACY_USER_REASON,
    'world.enter': MMO_WORLD_REASON,
    'world.resolveTransfer': MMO_WORLD_REASON,
}
