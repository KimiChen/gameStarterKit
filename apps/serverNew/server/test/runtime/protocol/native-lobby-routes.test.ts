import assert from 'node:assert/strict'
import {
    GameError,
    isLobbyRouteOutcome,
    ModSync,
    PlatformLineInfo,
    RedisService,
    RouteAction,
    timestamp,
    type LobbyConnectionContext,
    type LobbyRouteOutcome,
} from '@arthropoda/game-engine'
import {
    ALL_LOBBY_RPC_TYPES,
    LOBBY_RPC_ROUTE_MODES,
    type LobbyRpcType,
} from '../../../generated/lobby-contract/protocol/lobbyRpc'
import { NativeLobbyIdentityMap } from '../../../src/runtime/identity/NativeLobbyIdentityMap'
import { grantedItemCount } from '../../../src/runtime/lobby/NativeLobbyGrants'
import { NativeLobbyRouteRegistry } from '../../../src/runtime/lobby/NativeLobbyRouteRegistry'
import { NativeLobbyPendingRoutes } from '../../../src/runtime/lobby/NativeLobbyPendingRoutes'
import { assembleNativeLobbyRoutes, type NativeLobbyRouteAssembly } from '../../../src/runtime/lobby/NativeLobbyRoutes'
import { MailNativeLobbyStore } from '../../../src/modules/mail/lobby/MailNativeLobbyStore'
import { ShopNativeLobbyStore } from '../../../src/modules/shop/lobby/ShopNativeLobbyStore'
import {
    SNAKE_FRAGMENT_SKIN_IDS,
    SNAKE_FRAGMENT_SKIN_THRESHOLDS,
} from '../../../src/modules/snakeCosmetic/lobby/SnakeSkinBusinessCatalog'
import { SnakeCosmeticNativeLobbyStore } from '../../../src/modules/snakeCosmetic/lobby/SnakeCosmeticNativeLobbyStore'
import { User } from '../../../src/modules/user/bean/User'
import { UserSessionLifecycle } from '../../../src/modules/user/lifecycle/UserSessionLifecycle'
import {
    accessTicketHash,
    roomInviteCodeKey,
    roomTicketKey,
    roomTicketQuotaKey,
} from '../../../src/modules/room/lobby/RoomInviteContract'
import { installFakeCenterRedis, type FakeCenterRedis } from '../../support/FakeCenterRedis'
import { lobbyOutcomeData } from '../../support/lobbyOutcome'

/**
 * 原生 Lobby 的**全路由契约**测试（P4 验收：「全路由契约向量通过，关键写操作同时验证响应、
 * 实际状态和消耗/奖励；不接受只通过连接测试的『协议完成』」）。
 *
 * 与 `native-lobby-e2e.test.ts` 的分工：那一份证明「真实 socket 上能建连、认证、收发帧」，
 * 这一份证明「shared 声明的每一条路由都有唯一 handler，且每条写路由的响应、实际落库状态、
 * 消耗与奖励三者自洽」。两者合起来才是 P4 的验收面。
 *
 * 装配走**生产路径** `assembleNativeLobbyRoutes`：真 `NativeLobbyRouteRegistry`（含默认通用幂等闸）
 * + 真 `NativeLobbyIdentityMap`（中心 Redis 原子分配内部 uid）+ 模块贡献的真实 handler
 * + 中心 Redis 假体（含幂等闸三条 Lua 的逐条镜像）。
 */

const SID = 7
/** 本套件实际驱动过的路由；末尾用它对照 `ALL_LOBBY_RPC_TYPES`，防止「只测了局部就宣称全量」。 */
const exercised = new Set<string>()

describe('native Lobby full route contract', () => {
    let redis: FakeCenterRedis
    let assembly: NativeLobbyRouteAssembly
    /** 与装配共用同一实例：内部 uid 分配必须是一条链，测试不得另建一份映射。 */
    let identities: NativeLobbyIdentityMap
    let savedGlobals: Record<string, unknown> = {}
    let savedSave: typeof RedisService.save
    let savedProcessRouter: typeof RouteAction.processRouter
    let savedPlatformIdMap: Record<string, number>
    /** 领域推送出口的观测点：推送顺序（业务数据先提交、再通知）是断言对象。 */
    let pushes: Array<{ uid: string; sId: number; type: string; data: unknown }>
    /** 注入推送故障：用来验证「已提交的操作不会因为唤醒推送失败而变成可重复执行」。 */
    let pushFailure: Error | undefined

    before(() => {
        const noop = () => undefined
        const logger = { debug: noop, info: noop, warn: noop, error: noop, crit: noop }
        savedGlobals = {
            Log: (globalThis as Record<string, unknown>).Log,
            PLATFORM: (globalThis as Record<string, unknown>).PLATFORM,
            CP: (globalThis as Record<string, unknown>).CP,
            SERVER_ID: (globalThis as Record<string, unknown>).SERVER_ID,
        }
        ;(globalThis as Record<string, unknown>).Log = new Proxy(logger, {
            get: (target, key) => Reflect.get(target, key) ?? logger,
        })
        ;(globalThis as Record<string, unknown>).PLATFORM = 'bearjoy'
        ;(globalThis as Record<string, unknown>).SERVER_ID = SID
        ;(globalThis as Record<string, unknown>).CP = {
            platform: { gmSecret: 'gm-secret' },
            service: {
                sid: SID,
                clientHost: '127.0.0.1',
                clientPort: 41001,
                internalPort: 41002,
                authTimeoutMs: 1000,
                heartbeatTimeoutMs: 5000,
                maxPacketSize: 64 * 1024,
            },
        }
        savedPlatformIdMap = PlatformLineInfo.platformIdMap
        PlatformLineInfo.register({ bearjoy: 1 })
        GameError.logicError = new GameError(500, 'logic')
        GameError.runtimeError = new GameError(501, 'runtime')
        GameError.apiCallQueueTimeout = new GameError(502, 'queue timeout')
        savedSave = RedisService.save
        RedisService.save = async () => undefined
        savedProcessRouter = RouteAction.processRouter
        RouteAction.processRouter = undefined
        redis = installFakeCenterRedis({ player: true })

        pushes = []
        pushFailure = undefined
        identities = new NativeLobbyIdentityMap()
        assembly = assembleNativeLobbyRoutes({
            identities,
            // 建档钩子必须真的被调用：`user.updateProfile` 依赖 `onAuthenticated` 建出的默认档。
            registerCharacter: async () => undefined,
            pushToUser: async (uid, sId, type, data) => {
                if (pushFailure) throw pushFailure
                pushes.push({ uid, sId, type, data })
                return true
            },
        })
    })

    after(() => {
        RedisService.save = savedSave
        RouteAction.processRouter = savedProcessRouter
        RouteAction.callGroups.clear()
        PlatformLineInfo.register(savedPlatformIdMap)
        for (const [name, value] of Object.entries(savedGlobals)) {
            if (value === undefined) delete (globalThis as Record<string, unknown>)[name]
            else (globalThis as Record<string, unknown>)[name] = value
        }
    })

    it('treats routes owned by the other channel as declared ownership, not as a backlog', () => {
        // ⚠ 期望集**不能**直接取 shared 声明面：MMO（chat / party / world）在 apps/server 上实现，
        // 只是把域加进了同一份 registry（见 NativeLobbyPendingRoutes 抬头）。这里钉的是那条边界：
        // 「声明面 ∖ 注册面」必须与「归属另一条通道」登记表**逐条相等**，多一条少一条都红。
        assert.equal(ALL_LOBBY_RPC_TYPES.length, 40)
        const unregistered = ALL_LOBBY_RPC_TYPES.filter((type) => !assembly.routes.has(type))
        assert.deepEqual(
            [...unregistered].sort(),
            Object.keys(NativeLobbyPendingRoutes).sort(),
            '未注册的路由必须与「归属另一条通道」登记表逐条一致',
        )
        for (const type of unregistered) {
            assert.notEqual(NativeLobbyPendingRoutes[type]?.trim(), '', `${type} 的登记必须写明归属原因`)
        }
        assert.doesNotThrow(() => assembly.routes.assertComplete())
        assert.equal(assembly.routes.has('user.notARoute'), false)
    })

    it('rejects a registry that silently drops a route this project owns', () => {
        // 负向：登记表只能装「归属另一条通道」的路由。少注册一条本项目自己的路由，
        // 必须仍然拒绝启动 —— 否则这张表就从「登记归属」退化成「允许缺失」的旁路。
        const registry = new NativeLobbyRouteRegistry({ validateResponse: (_route, response) => response })
        const owned = ALL_LOBBY_RPC_TYPES.filter(
            (type) => !Object.prototype.hasOwnProperty.call(NativeLobbyPendingRoutes, type),
        )
        for (const type of owned) {
            if (type !== 'user.getInfo') registry.register(type, async () => ({}))
        }
        assert.throws(() => registry.assertComplete(), /unowned missing=\[user\.getInfo\]/)
    })

    it('rejects a stale ownership entry once the route is migrated', () => {
        // 负向：路由迁走（已注册）后登记行就陈旧了。这条闸是「自动收紧」——迁移落地必须同批删行，
        // 不然这张表会变成永久旁路。
        const registry = new NativeLobbyRouteRegistry({ validateResponse: (_route, response) => response })
        for (const type of ALL_LOBBY_RPC_TYPES) registry.register(type, async () => ({}))
        assert.throws(() => registry.assertComplete(), /stale pending=\[/)
    })

    it('rejects a registry that registers a route shared never declared', () => {
        const registry = new NativeLobbyRouteRegistry({ validateResponse: (_route, response) => response })
        for (const type of ALL_LOBBY_RPC_TYPES) registry.register(type, async () => ({}))
        registry.register('user.notARoute' as LobbyRpcType, async () => ({}))
        assert.throws(() => registry.assertComplete(), /unexpected=\[user\.notARoute\]/)
    })

    it('keeps the execution mode declared by shared as the only source of truth', () => {
        // 模式必须来自 shared：本地维护第二份清单会让「哪些路由需要幂等闸」漂移。
        const modes = Object.entries(LOBBY_RPC_ROUTE_MODES)
        assert.equal(modes.length, 40)
        assert.equal(modes.filter(([, mode]) => mode === 'idempotent-write').length, 20)
        assert.equal(modes.filter(([, mode]) => mode === 'natural-write').length, 6)
        assert.equal(modes.filter(([, mode]) => mode === 'query').length, 14)
    })

    it('credits coins through redeem and lands the purchase reward in real state', async () => {
        const uid = 'contract-shop'
        await connect(uid)

        // 兑换码 → 金币：奖励与余额都必须是真实写入，不是响应里的自我声明。
        assert.deepEqual(await call(uid, 'redeem.claim', { clientReqId: 'r-1', code: 'WELCOME100' }), {
            code: 'WELCOME100',
            reward: { kind: 'coins', amount: 100 },
            balance: 100,
        })
        assert.equal(await balanceOf(uid), 100)

        // 同一 clientReqId 重放返回首次结果，且不重复发奖。
        assert.deepEqual(await call(uid, 'redeem.claim', { clientReqId: 'r-1', code: 'WELCOME100' }), {
            code: 'WELCOME100',
            reward: { kind: 'coins', amount: 100 },
            balance: 100,
        })
        assert.equal(await balanceOf(uid), 100)
        // 同一码换 clientReqId 必须被原子拒绝，而不是再发一次。
        await fails(uid, 'redeem.claim', { clientReqId: 'r-2', code: 'WELCOME100' }, 'REDEEM_CODE_USED')
        await fails(uid, 'redeem.claim', { clientReqId: 'r-3', code: 'NOPE' }, 'REDEEM_CODE_INVALID')

        // 购买：响应、扣款、发放三者必须一致。
        const purchased = (await call(uid, 'shop.purchase', { clientReqId: 's-1', sku: 'shop.frag29x10' })) as {
            opId: string
            status: string
            balance: number
            granted: unknown[]
        }
        assert.equal(purchased.status, 'done')
        assert.equal(purchased.balance, 0)
        assert.deepEqual(purchased.granted, [{ kind: 'item', itemId: 29, count: 10 }])
        assert.equal(await balanceOf(uid), 0)
        // 「发了但没落地」是本轮修掉的缺陷：道具必须真的进账。
        assert.equal(await itemCountOf(uid, 29), 10)
        // 生产读函数必须指向同一本账，否则查询面会看到另一份数据。
        assert.equal(await grantedItemCount(uid, SID, 29), 10)

        // 幂等：同 clientReqId 重放不重复扣款、不重复发奖。
        assert.deepEqual(await call(uid, 'shop.purchase', { clientReqId: 's-1', sku: 'shop.frag29x10' }), purchased)
        assert.equal(await balanceOf(uid), 0)
        assert.equal(await itemCountOf(uid, 29), 10)
        // 同 clientReqId 换 payload：由**通用幂等闸**在 handler 之前拒绝。coreErrors.ts 把
        // OPERATION_CONFLICT 明确定义为「同 clientReqId 携带了不同 canonical payload（客户端缺陷）」，
        // 所以这一层必须先于领域代码返回——领域 handler 根本不会跑，更不会留下副作用。
        await fails(uid, 'shop.purchase', { clientReqId: 's-1', sku: 'shop.frag17x10' }, 'OPERATION_CONFLICT')
        // 闸的结果窗口（60s）过去后，客户端仍会重试，而**领域收据**还在：这时才轮到本域自己的
        // ORDER_MISMATCH。删掉闸记录正是这个场景（闸自认没见过，领域仍认得出是另一单）。
        await redis.delete(`nativeLobby:idem:v1:{${SID}:${uid}}:shop.purchase:s-1`)
        await fails(uid, 'shop.purchase', { clientReqId: 's-1', sku: 'shop.frag17x10' }, 'ORDER_MISMATCH')
        // 两条路径都必须拒绝，且都不得换单成交。
        assert.equal(await itemCountOf(uid, 17), 0)
        // 余额不足时不得留下任何发放。
        await fails(uid, 'shop.purchase', { clientReqId: 's-2', sku: 'shop.frag17x10' }, 'INSUFFICIENT_BALANCE')
        assert.equal(await itemCountOf(uid, 17), 0)
        assert.equal(await balanceOf(uid), 0)

        // 恢复查询：opId 归本 uid，越权 opId 折叠为「结果不可用」。
        assert.deepEqual(await call(uid, 'shop.queryOp', { opId: purchased.opId }), purchased)
        await fails(uid, 'shop.queryOp', { opId: 'shop:7:someone-else:s-1' }, 'OPERATION_RESULT_EXPIRED')
    })

    it('captures, reinforces and reports a guarded enemy tile without losing the committed damage', async () => {
        const owner = 'contract-arena-owner'
        const rival = 'contract-arena-rival'
        await connect(owner)
        await connect(rival)

        assert.deepEqual(await call(owner, 'arena.board', {}), { tiles: emptyBoard(), myTrophies: 0 })

        // 无主格：占下并得 1 奖杯。
        assert.deepEqual(await call(owner, 'arena.capture', { clientReqId: 'c-1', tile: 0 }), {
            tile: 0,
            power: 1,
            trophies: 1,
        })
        // 自格：加固 +1 并封顶。
        assert.deepEqual(await call(owner, 'arena.capture', { clientReqId: 'c-2', tile: 0 }), {
            tile: 0,
            power: 2,
            trophies: 1,
        })
        // 敌格仍有守备（power=2）：本次确实削了 1 点并已提交，但必须回报 ARENA_TILE_TAKEN，
        // 否则客户端不会重读棋盘（`ArenaBoardLogic` 正是按该码判定 boardChanged）。
        await fails(rival, 'arena.capture', { clientReqId: 'c-3', tile: 0 }, 'ARENA_TILE_TAKEN')
        const afterRival = (await call(rival, 'arena.board', {})) as { tiles: Array<{ tile: number; power: number }> }
        assert.equal(afterRival.tiles[0]!.power, 1, '削守备必须已提交，不能被错误码回滚掉')
        // 重放必须复现同一结论：不能再削一次，也不能把首次的拒绝改判成成功。
        await fails(rival, 'arena.capture', { clientReqId: 'c-3', tile: 0 }, 'ARENA_TILE_TAKEN')
        const stillOne = (await call(rival, 'arena.board', {})) as { tiles: Array<{ tile: number; power: number }> }
        assert.equal(stillOne.tiles[0]!.power, 1, '重放不能再削一次守备')
        assert.equal(((await call(owner, 'arena.board', {})) as { myTrophies: number }).myTrophies, 1)

        // shared 棋盘规则：敌格要削到 **power 归零**才可夺取（`canCaptureTile` 要求 power ≤ 0）。
        // power=1 时再打一次仍是被拒，但守备归零——这一步不能跳，否则「可夺取」是凭空来的。
        await fails(rival, 'arena.capture', { clientReqId: 'c-4', tile: 0 }, 'ARENA_TILE_TAKEN')
        assert.equal(((await call(rival, 'arena.board', {})) as { tiles: Array<{ power: number }> }).tiles[0]!.power, 0)

        // 守备归零后改主；改主给新主 +1 奖杯。
        assert.deepEqual(await call(rival, 'arena.capture', { clientReqId: 'c-5', tile: 0 }), {
            tile: 0,
            power: 1,
            trophies: 1,
        })
        const board = (await call(rival, 'arena.board', {})) as { tiles: Array<{ tile: number; ownerUid: string }> }
        assert.equal(board.tiles[0]!.ownerUid, rival)

        // 同 clientReqId 换格是稳定冲突；重放不重复加奖杯。
        await fails(owner, 'arena.capture', { clientReqId: 'c-1', tile: 5 }, 'OPERATION_CONFLICT')
        assert.equal(((await call(owner, 'arena.board', {})) as { myTrophies: number }).myTrophies, 1)
    })

    it('spends coins on a boost and refuses a tile the player does not own', async () => {
        const uid = 'contract-arena-shop'
        const stranger = 'contract-arena-shop-stranger'
        await connect(uid)
        await connect(stranger)
        await new ShopNativeLobbyStore().credit(uid, SID, 10)

        await call(uid, 'arena.capture', { clientReqId: 'b-0', tile: 1 })
        const boosted = (await call(uid, 'arenaShop.buyBoost', { clientReqId: 'b-1', tile: 1 })) as {
            tile: number
            power: number
            balance: number | null
        }
        assert.deepEqual(boosted, { tile: 1, power: 6, balance: 0 })
        // 消耗与状态都要落地：金币真的扣了，守备真的加了。
        assert.equal(await balanceOf(uid), 0)

        // 非自有格：先拒绝，且不得产生消费。
        await new ShopNativeLobbyStore().credit(stranger, SID, 10)
        await fails(stranger, 'arenaShop.buyBoost', { clientReqId: 'b-2', tile: 1 }, 'ARENA_SHOP_TILE_NOT_OWNED')
        assert.equal(await balanceOf(stranger), 10, '被拒绝的 boost 绝不能扣款')

        // 余额不足时同样不得加固。
        await call(uid, 'arena.capture', { clientReqId: 'b-3', tile: 2 })
        await fails(uid, 'arenaShop.buyBoost', { clientReqId: 'b-4', tile: 2 }, 'INSUFFICIENT_BALANCE')
        const board = (await call(uid, 'arena.board', {})) as { tiles: Array<{ tile: number; power: number }> }
        assert.equal(board.tiles[2]!.power, 1)

        // 幂等重放：不再扣款、不再加固。
        assert.deepEqual(await call(uid, 'arenaShop.buyBoost', { clientReqId: 'b-1', tile: 1 }), boosted)
        assert.equal(await balanceOf(uid), 0)
    })

    it('commits guild membership before waking members up and never pushes on a rejected join', async () => {
        const uid = 'contract-guild'
        const peer = 'contract-guild-peer'
        await connect(uid)
        await connect(peer)

        pushes = []
        assert.deepEqual(await call(uid, 'guild.join', { clientReqId: 'g-1', guildId: 1 }), { ok: true, seq: 1 })
        // 推送只是唤醒：载荷不带事件内容，且必须在档字段写完之后发出。
        assert.deepEqual(pushes, [{ uid, sId: SID, type: 'guild.event', data: { seq: 1, guildId: 1 } }])
        assert.equal((await redis.hGet('nativeLobby:user:profile:v1', `${SID}:${uid}`))!.includes('"guildId":1'), true)
        assert.deepEqual(await redis.sMembers(`nativeLobby:guild:members:v1:${SID}:1`), [uid])

        // 第二个成员加入：广播必须覆盖当前成员集合（含新加入者），且顺序按成员索引读出来。
        pushes = []
        assert.deepEqual(await call(peer, 'guild.join', { clientReqId: 'g-peer', guildId: 1 }), { ok: true, seq: 2 })
        assert.deepEqual(pushes.map((push) => push.uid).sort(), [uid, peer].sort())
        assert.deepEqual(pushes[0]!.data, { seq: 2, guildId: 1 })

        // 事件列表是可恢复读面：推送丢了也能靠它自愈。
        const events = (await call(uid, 'guild.getEvents', { sinceSeq: 0 })) as {
            events: Array<{ seq: number; kind: string }>
            latestSeq: number
            guildId: number
        }
        assert.deepEqual(
            events.events.map((event) => [event.seq, event.kind]),
            [
                [1, 'memberJoin'],
                [2, 'memberJoin'],
            ],
        )
        assert.deepEqual({ latestSeq: events.latestSeq, guildId: events.guildId }, { latestSeq: 2, guildId: 1 })

        // 未知工会必须被拒绝，且不能把玩家写成「有工会」。
        await fails(uid, 'guild.join', { clientReqId: 'g-2', guildId: 999 }, 'INVALID_PAYLOAD')
        assert.equal((await redis.sMembers(`nativeLobby:guild:members:v1:${SID}:999`)).length, 0)

        // 幂等重放不产生第三条事件。
        assert.deepEqual(await call(uid, 'guild.join', { clientReqId: 'g-1', guildId: 1 }), { ok: true, seq: 1 })
        assert.equal(((await call(uid, 'guild.getEvents', { sinceSeq: 0 })) as { events: unknown[] }).events.length, 2)

        // 退出：先把成员索引与档字段改掉，再广播给**剩下的**成员；退会者靠响应而非推送收敛。
        pushes = []
        assert.deepEqual(await call(uid, 'guild.leave', { clientReqId: 'g-3' }), { ok: true })
        assert.deepEqual(pushes, [{ uid: peer, sId: SID, type: 'guild.event', data: { seq: 3, guildId: 1 } }])
        assert.deepEqual(await redis.sMembers(`nativeLobby:guild:members:v1:${SID}:1`), [peer])
        assert.equal(((await call(uid, 'guild.getEvents', { sinceSeq: 0 })) as { guildId: number }).guildId, 0)
        // 幂等重放不再产生新事件。
        pushes = []
        assert.deepEqual(await call(uid, 'guild.leave', { clientReqId: 'g-3' }), { ok: true })
        assert.deepEqual(pushes, [])
    })

    it('keeps a committed write replayable when the wake-up push throws', async () => {
        // P7 第 5 项：事件/推送异常不得把**已提交**的操作变成「可重复执行」。
        // `guild.join` 的时序是「提交成员关系与事件 → 广播唤醒」。广播抛异常会让 handler 失败，
        // 通用幂等闸随即**释放租约**（见 `native-lobby-idempotency.test.ts` 的
        // 「releases the lease when the handler fails」），因此同 clientReqId 的重试会**重新进入
        // handler**；这时必须靠业务自身的「已是成员」守卫挡住第二次事件，而不是靠闸记住结果。
        const uid = 'contract-push-fault'
        const context = await connect(uid)

        pushFailure = new Error('wake-up push failed')
        try {
            await assert.rejects(
                () => assembly.routes.execute('guild.join', context, { clientReqId: 'pf-1', guildId: 2 }),
                /wake-up push failed/,
            )
        } finally {
            pushFailure = undefined
        }

        // 提交必须已经落地：成员索引、档字段与事件流都在，且事件只有一条。
        assert.deepEqual(await redis.sMembers(`nativeLobby:guild:members:v1:${SID}:2`), [uid])
        assert.equal((await redis.hGet('nativeLobby:user:profile:v1', `${SID}:${uid}`))!.includes('"guildId":2'), true)
        const committed = (await call(uid, 'guild.getEvents', { sinceSeq: 0 })) as {
            events: Array<{ seq: number; kind: string }>
            latestSeq: number
            guildId: number
        }
        assert.deepEqual(
            committed.events.map((event) => event.kind),
            ['memberJoin'],
        )
        assert.equal(committed.guildId, 2)

        // 同 clientReqId 重试：确实重新进入了 handler，但不得再产生一次 memberJoin、也不得推进 seq。
        pushes = []
        assert.deepEqual(await call(uid, 'guild.join', { clientReqId: 'pf-1', guildId: 2 }), {
            ok: true,
            seq: committed.latestSeq,
        })
        assert.deepEqual(pushes, [])
        const after = (await call(uid, 'guild.getEvents', { sinceSeq: 0 })) as {
            events: Array<{ kind: string }>
            latestSeq: number
        }
        assert.deepEqual(
            after.events.map((event) => event.kind),
            ['memberJoin'],
        )
        assert.equal(after.latestSeq, committed.latestSeq)
    })

    it('delivers mail, marks it read and claims the attach exactly once', async () => {
        const uid = 'contract-mail'
        await connect(uid)
        // 邮件投递权威在投递侧（GM/全局邮件）；这里用模块自己的 store 播种，再只经 Lobby 路由消费。
        const delivered = await new MailNativeLobbyStore(async () => true).deliver(uid, SID, {
            title: '补偿',
            body: '附件如下',
            granted: [{ kind: 'item', itemId: 17, count: 3 }],
        })

        const list = (await call(uid, 'mail.list', { limit: 20 })) as { mails: Array<Record<string, unknown>> }
        assert.equal(list.mails.length, 1)
        assert.deepEqual(
            { mailId: list.mails[0]!.mailId, hasAttach: list.mails[0]!.hasAttach, read: list.mails[0]!.read },
            { mailId: delivered, hasAttach: true, read: false },
        )

        assert.deepEqual(await call(uid, 'mail.markRead', { mailId: delivered }), { ok: true })
        const readBack = (await call(uid, 'mail.list', {})) as { mails: Array<{ read: boolean }> }
        assert.equal(readBack.mails[0]!.read, true)
        // natural-write 的天然幂等：重复标记不报错、不重复写。
        assert.deepEqual(await call(uid, 'mail.markRead', { mailId: delivered }), { ok: true })

        const claimed = (await call(uid, 'mail.claimAttach', { clientReqId: 'm-1', mailId: delivered })) as {
            status: string
            granted: unknown[]
        }
        assert.equal(claimed.status, 'done')
        assert.deepEqual(claimed.granted, [{ kind: 'item', itemId: 17, count: 3 }])
        assert.equal(await itemCountOf(uid, 17), 3)
        // 重放不重复发奖。
        assert.deepEqual(await call(uid, 'mail.claimAttach', { clientReqId: 'm-1', mailId: delivered }), claimed)
        assert.equal(await itemCountOf(uid, 17), 3)
        // 不存在的附件必须被拒绝，不能回一个空成功。
        await fails(uid, 'mail.claimAttach', { clientReqId: 'm-2', mailId: 999_999 }, 'INVALID_PAYLOAD')
    })

    it('binds the creation ticket to the caller, caps concurrent private rooms and never self-rolls idempotency', async () => {
        const uid = 'contract-room'
        await connect(uid)

        const request = { clientReqId: 'p-1', mode: 'privateFixture', modeVersion: 2, profile: 'private' }
        const first = (await call(uid, 'room.prepareCreate', request)) as { creationTicket: string; expiresAt: number }
        assert.ok(first.creationTicket.length >= 16)
        assert.ok(first.expiresAt > Date.now())

        // 幂等由**通用幂等闸**承担（契约抬头：jti 状态机建立在通用幂等层之上，⛔ 不另起一套）：
        // 重放必须逐字节返回首次结果，且不得再签发第二张 ticket。
        assert.deepEqual(await call(uid, 'room.prepareCreate', request), first)
        assert.equal(await ticketRecordCount(uid), 1)
        // 同 clientReqId 换参数稳定冲突。
        await fails(
            uid,
            'room.prepareCreate',
            { clientReqId: 'p-1', mode: 'privateFixture', modeVersion: 2, profile: 'default' },
            'OPERATION_CONFLICT',
        )

        // 配额：未消费的 creation ticket 超过上限即拒绝，且不签发。
        const second = (await call(uid, 'room.prepareCreate', { ...request, clientReqId: 'p-2' })) as {
            creationTicket: string
        }
        assert.notEqual(second.creationTicket, first.creationTicket)
        await fails(uid, 'room.prepareCreate', { ...request, clientReqId: 'p-3' }, 'ROOM_QUOTA_EXCEEDED')
        assert.equal(await ticketRecordCount(uid), 2)

        // resolve：邀请码租约由 **GameRoom 侧**写入（接缝），Lobby 只读。租约记录必须逐字段对齐
        // GameRoom 的 `readInviteLease`（v/state/roomId/mode/modeVersion/profile/sId/generation）。
        await fails(uid, 'room.resolve', { code: '000000' }, 'ROOM_CODE_UNAVAILABLE')
        await seedInviteLease('123456', { roomId: 'room-abc', generation: 3 })
        const resolved = (await call(uid, 'room.resolve', { code: '123456' })) as Record<string, unknown>
        assert.deepEqual(
            {
                roomId: resolved.roomId,
                mode: resolved.mode,
                profile: resolved.profile,
                modeVersion: resolved.modeVersion,
            },
            { roomId: 'room-abc', mode: 'privateFixture', profile: 'private', modeVersion: 2 },
        )
        // join ticket 也必须落在 GameRoom 能按 sha256 寻址的键上，否则 `claimJoin` 根本找不到它。
        const joinTicket = String(resolved.joinTicket)
        assert.ok(joinTicket.length >= 16)
        const storedJoin = JSON.parse(
            (await redis.get(roomTicketKey(SID, accessTicketHash(joinTicket)))) ?? 'null',
        ) as Record<string, unknown>
        assert.deepEqual(
            {
                purpose: storedJoin.purpose,
                state: storedJoin.state,
                roomId: storedJoin.roomId,
                code: storedJoin.code,
                generation: storedJoin.generation,
                sId: storedJoin.sId,
                uid: storedJoin.uid,
            },
            {
                purpose: 'join',
                state: 'issued',
                roomId: 'room-abc',
                code: '123456',
                generation: 3,
                sId: SID,
                uid,
            },
        )

        // 折叠类：墓碑隔离期 / 记录腐坏 / 他区租约 / 目录已不再声明该组合——响应字节完全相同，
        // 都不回显客户端给的 code（⛔ resolve 不是存在性预言机）。
        await redis.set(roomInviteCodeKey(SID, '654321'), JSON.stringify({ v: 1, state: 'tombstone', generation: 1 }))
        await fails(uid, 'room.resolve', { code: '654321' }, 'ROOM_CODE_UNAVAILABLE')
        await seedInviteLease('654322', { roomId: 'room-broken' })
        await redis.set(roomInviteCodeKey(SID, '654322'), '{not json')
        await fails(uid, 'room.resolve', { code: '654322' }, 'ROOM_CODE_UNAVAILABLE')
        await seedInviteLease('654323', { roomId: 'room-other', sId: SID + 1 })
        await fails(uid, 'room.resolve', { code: '654323' }, 'ROOM_CODE_UNAVAILABLE')
        await seedInviteLease('654324', { roomId: 'room-gone', mode: 'removedMode' })
        await fails(uid, 'room.resolve', { code: '654324' }, 'ROOM_CODE_UNAVAILABLE')
    })

    it('gates private-room creation on the shared catalog and keeps infrastructure failures retryable', async () => {
        const uid = 'contract-room-catalog'
        await connect(uid)
        const base = { clientReqId: 'c-1', mode: 'privateFixture', modeVersion: 2, profile: 'private' }

        // 目录闸（真源 = shared 的 GAMEPLAY_CATALOG）：未知 mode / 未声明 profile / 版本不符 /
        // 非 invite-code profile 一律 INVALID_PAYLOAD，且**不得**留下配额成员。
        await fails(uid, 'room.prepareCreate', { ...base, mode: 'noSuchMode' }, 'INVALID_PAYLOAD')
        await fails(uid, 'room.prepareCreate', { ...base, profile: 'dropIn' }, 'INVALID_PAYLOAD')
        await fails(uid, 'room.prepareCreate', { ...base, modeVersion: 1 }, 'INVALID_PAYLOAD')
        await fails(
            uid,
            'room.prepareCreate',
            { ...base, mode: 'idle', modeVersion: 3, profile: 'default' },
            'INVALID_PAYLOAD',
        )
        assert.equal(await ticketRecordCount(uid), 0)

        // 签发 Lua 失败 = 结果未知（可能已落盘也可能没有）：必须按可重试返回，⛔ 不假装成功。
        // 按脚本标记注入：直接让「下一次 eval」失败会打到通用幂等闸的 acquire，测的不是这条路径。
        redis.failNextScript("'t:' .. ARGV[3]")
        await fails(uid, 'room.prepareCreate', { ...base, clientReqId: 'c-2' }, 'ROOM_RESULT_UNKNOWN')

        const issued = (await call(uid, 'room.prepareCreate', { ...base, clientReqId: 'c-3' })) as {
            creationTicket: string
        }
        assert.ok(issued.creationTicket.length >= 16)
        // creation ticket 记录必须是 GameRoom 的 `claimCreation` 能消费的形状（purpose=create +
        // state=issued + 数值 sId + jti），否则旧 GameRoom 会一律判 'invalid'/'mismatch'。
        const storedCreate = JSON.parse(
            (await redis.get(roomTicketKey(SID, accessTicketHash(issued.creationTicket)))) ?? 'null',
        ) as Record<string, unknown>
        assert.deepEqual(
            {
                v: storedCreate.v,
                purpose: storedCreate.purpose,
                state: storedCreate.state,
                mode: storedCreate.mode,
                modeVersion: storedCreate.modeVersion,
                profile: storedCreate.profile,
                sId: storedCreate.sId,
                uid: storedCreate.uid,
                hasJti: typeof storedCreate.jti === 'string' && storedCreate.jti.length > 0,
            },
            {
                v: 1,
                purpose: 'create',
                state: 'issued',
                mode: 'privateFixture',
                modeVersion: 2,
                profile: 'private',
                sId: SID,
                uid,
                hasJti: true,
            },
        )
        assert.equal(await ticketRecordCount(uid), 1)

        // 邀请码读取的基础设施失败是可重试的 ROOM_SERVICE_UNAVAILABLE，⛔ 不是「码不存在」。
        redis.failNextCommand('get')
        await fails(uid, 'room.resolve', { code: '111111' }, 'ROOM_SERVICE_UNAVAILABLE')
        // join ticket 写入失败同理。
        await seedInviteLease('111111', { roomId: 'room-cap' })
        redis.failNextCommand('set')
        await fails(uid, 'room.resolve', { code: '111111' }, 'ROOM_SERVICE_UNAVAILABLE')

        // 容量 / 开局快照走 GameRoom 的房间缓存（Colyseus RedisDriver 的 `roomcaches`）：
        // 满员 → ROOM_FULL、已锁 → ROOM_START_IN_PROGRESS；快照源缺失 → 跳过（契约允许）。
        await redis.hSet('roomcaches', 'room-cap', JSON.stringify({ locked: false, clients: 4, maxClients: 4 }))
        await fails(uid, 'room.resolve', { code: '111111' }, 'ROOM_FULL')
        await redis.hSet('roomcaches', 'room-cap', JSON.stringify({ locked: true, clients: 1, maxClients: 4 }))
        await fails(uid, 'room.resolve', { code: '111111' }, 'ROOM_START_IN_PROGRESS')
        await redis.hSet('roomcaches', 'room-cap', JSON.stringify({ locked: false, clients: 1, maxClients: 4 }))
        const allowed = (await call(uid, 'room.resolve', { code: '111111' })) as { roomId: string }
        assert.equal(allowed.roomId, 'room-cap')
    })

    it('settles due marches in a bounded batch and asks the client to retry while a backlog remains', async () => {
        const uid = 'contract-slg'
        await connect(uid)
        await new ShopNativeLobbyStore().credit(uid, SID, 5)

        assert.deepEqual(await call(uid, 'slg.mapTiles', { mapId: 'senzhiguo', rect: chunkRect() }), {
            tiles: [],
            revision: 0,
            myTrophies: 0,
        })

        const captured = (await call(uid, 'slg.tileCapture', { clientReqId: 't-1', tileId: 0 })) as {
            tile: { tileId: number; ownerUid: string; guardPower: number }
            outcome: string
        }
        assert.deepEqual(captured, { tile: { tileId: 0, ownerUid: uid, guardPower: 1 }, outcome: 'captured' })
        assert.deepEqual(await call(uid, 'slg.tileCapture', { clientReqId: 't-2', tileId: 0 }), {
            tile: { tileId: 0, ownerUid: uid, guardPower: 2 },
            outcome: 'reinforced',
        })
        // 幂等重放返回首次结果，不重复加固。
        assert.deepEqual(await call(uid, 'slg.tileCapture', { clientReqId: 't-1', tileId: 0 }), captured)

        const afterCapture = (await call(uid, 'slg.mapTiles', { mapId: 'senzhiguo', rect: chunkRect() })) as {
            tiles: Array<{ tileId: number }>
            revision: number
            myTrophies: number
        }
        assert.deepEqual(
            afterCapture.tiles.map((tile) => tile.tileId),
            [0],
        )
        // 两次占领各推进一次 revision；只读查询不推进。
        assert.equal(afterCapture.revision, 2)
        assert.equal(afterCapture.myTrophies, 1)

        // 行军：起点必须自有、金币真的扣、同时进行中的行军有上限。
        await fails(uid, 'slg.marchDispatch', { clientReqId: 'd-x', fromTile: 5, toTile: 6 }, 'SLG_TILE_NOT_OWNED')
        const dispatched = (await call(uid, 'slg.marchDispatch', { clientReqId: 'd-1', fromTile: 0, toTile: 1 })) as {
            march: { marchId: string; status: string; fromTile: number; toTile: number }
            balance: number
        }
        assert.equal(dispatched.march.status, 'marching')
        assert.equal(dispatched.balance, 4)
        assert.equal(await balanceOf(uid), 4)
        // 幂等重放不重复扣费。
        assert.deepEqual(
            await call(uid, 'slg.marchDispatch', { clientReqId: 'd-1', fromTile: 0, toTile: 1 }),
            dispatched,
        )
        assert.equal(await balanceOf(uid), 4)
        await call(uid, 'slg.marchDispatch', { clientReqId: 'd-2', fromTile: 0, toTile: 2 })
        await call(uid, 'slg.marchDispatch', { clientReqId: 'd-3', fromTile: 0, toTile: 3 })
        await fails(uid, 'slg.marchDispatch', { clientReqId: 'd-4', fromTile: 0, toTile: 4 }, 'SLG_MARCH_LIMIT')
        assert.equal(await balanceOf(uid), 2, '被上限拒绝的行军绝不能扣费')

        // 撤回：只能撤自己的、只能撤进行中的。
        const recalled = (await call(uid, 'slg.marchRecall', {
            clientReqId: 'rc-1',
            marchId: dispatched.march.marchId,
        })) as { march: { status: string } }
        assert.equal(recalled.march.status, 'recalled')
        assert.deepEqual(
            await call(uid, 'slg.marchRecall', { clientReqId: 'rc-1', marchId: dispatched.march.marchId }),
            recalled,
        )
        await fails(uid, 'slg.marchRecall', { clientReqId: 'rc-2', marchId: 'nope' }, 'SLG_MARCH_NOT_FOUND')
        await fails(
            uid,
            'slg.marchRecall',
            { clientReqId: 'rc-3', marchId: dispatched.march.marchId },
            'SLG_MARCH_FINISHED',
        )

        // 结算：到期行军由读路径有界推进；积压超过一批时必须让客户端稍后重试，
        // ⛔ 不能用一个无界 hGetAll 循环把请求拖到 handler 超时。
        await seedArrivedMarches('contract-slg-backlog', 40, 100)
        await fails(
            'contract-slg-backlog',
            'slg.mapTiles',
            { mapId: 'senzhiguo', rect: chunkRect() },
            'SLG_SETTLEMENT_PENDING',
        )
        // 可重试语义：退避后重试即可把积压清空，而不是永久失败。
        await call('contract-slg-backlog', 'slg.mapTiles', { mapId: 'senzhiguo', rect: chunkRect() })
        await seedArrivedMarches('contract-slg-small', 3, 5)
        const settled = (await call('contract-slg-small', 'slg.mapTiles', {
            mapId: 'senzhiguo',
            rect: chunkRect(),
        })) as { tiles: Array<{ tileId: number; ownerUid: string }> }
        assert.deepEqual(
            settled.tiles.filter((tile) => tile.ownerUid === 'contract-slg-small').map((tile) => tile.tileId),
            [5, 6, 7],
            '一批之内的到期行军必须在同一次读里结算完',
        )
    })

    it('writes the wardrobe snapshot, equips and crafts with the server catalog as the only authority', async () => {
        const uid = 'contract-snake'
        await connect(uid)

        const snapshot = (await call(uid, 'snakeCosmetic.getSnapshot', {})) as {
            profile: { equippedSkinId: number; ownedSkinIds: number[]; version: number }
            catalog: unknown[]
        }
        assert.ok(snapshot.catalog.length > 0)
        assert.equal(snapshot.profile.version, 0)

        // natural-write：重复装备同一皮肤是 no-op，不推进 version。
        const equipped = (await call(uid, 'snakeCosmetic.equip', { skinId: snapshot.profile.equippedSkinId })) as {
            profile: { version: number }
        }
        assert.equal(equipped.profile.version, 0)
        await fails(uid, 'snakeCosmetic.equip', { skinId: 2 }, 'SNAKE_SKIN_NOT_OWNED')
        await fails(uid, 'snakeCosmetic.equip', { skinId: 999_999 }, 'SNAKE_SKIN_UNKNOWN')

        const craftable = [...SNAKE_FRAGMENT_SKIN_THRESHOLDS.keys()][0]!
        const threshold = SNAKE_FRAGMENT_SKIN_THRESHOLDS.get(craftable)!
        await fails(uid, 'snakeCosmetic.unlock', { skinId: craftable }, 'SNAKE_SKIN_FRAGMENTS_INSUFFICIENT')
        await seedWardrobe(uid, { owned: [snapshot.profile.equippedSkinId], fragments: { [craftable]: threshold + 2 } })
        const unlocked = (await call(uid, 'snakeCosmetic.unlock', { skinId: craftable })) as {
            profile: { ownedSkinIds: number[]; fragmentBalances: Record<string, number>; version: number }
        }
        assert.equal(unlocked.profile.ownedSkinIds.includes(craftable), true)
        // 碎片真的被扣掉，且只扣一次。
        assert.equal(unlocked.profile.fragmentBalances[String(craftable)], 2)
        const repeated = (await call(uid, 'snakeCosmetic.unlock', { skinId: craftable })) as typeof unlocked
        assert.equal(repeated.profile.fragmentBalances[String(craftable)], 2)
        assert.equal(repeated.profile.version, unlocked.profile.version)
        assert.deepEqual(
            SNAKE_FRAGMENT_SKIN_IDS.map((id) => typeof unlocked.profile.fragmentBalances[String(id)]),
            SNAKE_FRAGMENT_SKIN_IDS.map(() => 'number'),
        )
    })

    it('reads and writes the real profile, and keeps the update receipt idempotent', async () => {
        const uid = 'contract-user'
        await connect(uid)

        assert.deepEqual(await call(uid, 'user.getUserId', {}), { uid })
        const info = (await call(uid, 'user.getInfo', {})) as { user: Record<string, unknown> }
        assert.deepEqual(info.user, {
            uid,
            star: 0,
            maxRound: 0,
            wins: 0,
            losses: 0,
            stamina: 0,
            lastStaminaRecoverAt: 0,
            musicOn: true,
            sfxOn: true,
            guildId: 0,
            ver: 0,
        })

        assert.deepEqual(await call(uid, 'user.updateProfile', { clientReqId: 'u-1', nickname: '阿呆', avatarId: 7 }), {
            ok: true,
        })
        // 公开视图不带私有字段；自档 ver 必须推进。
        assert.deepEqual(await call(uid, 'user.getProfile', { uid }), {
            profile: { uid, nickname: '阿呆', avatarId: 7, province: '', star: 0, maxRound: 0, wins: 0, losses: 0 },
        })
        assert.equal(((await call(uid, 'user.getInfo', {})) as { user: { ver: number } }).user.ver, 1)
        // 幂等重放不再推进 ver；同 ID 换参数稳定冲突。
        assert.deepEqual(await call(uid, 'user.updateProfile', { clientReqId: 'u-1', nickname: '阿呆', avatarId: 7 }), {
            ok: true,
        })
        assert.equal(((await call(uid, 'user.getInfo', {})) as { user: { ver: number } }).user.ver, 1)
        await fails(uid, 'user.updateProfile', { clientReqId: 'u-1', nickname: '换个人' }, 'OPERATION_CONFLICT')
        assert.equal(
            ((await call(uid, 'user.getInfo', {})) as { user: { nickname?: string } }).user.nickname,
            undefined,
        )
        // 未建档的 uid 读他档返回 null，而不是半状态。
        assert.deepEqual(await call(uid, 'user.getProfile', { uid: 'never-seen' }), { profile: null })
    })

    it('recovers an interrupted grant on retry without charging or rewarding twice', async () => {
        const uid = 'contract-grant-recovery'
        await connect(uid)
        await new ShopNativeLobbyStore().credit(uid, SID, 100)

        // 故障注入：发放的第一次写入失败。契约要求此时回 GRANTING 并保留 intent，
        // ⛔ 不能回 done 把「没发出去」伪装成成功。
        const original = redis.hIncrBy.bind(redis)
        let failOnce = true
        redis.hIncrBy = async (key: string, field: string, increment: number) => {
            if (failOnce && key === 'nativeLobby:grants:items:v1') {
                failOnce = false
                throw new Error('grant storage unavailable')
            }
            return original(key, field, increment)
        }
        try {
            await fails(uid, 'shop.purchase', { clientReqId: 'gr-1', sku: 'shop.frag29x10' }, 'GRANTING')
        } finally {
            redis.hIncrBy = original
        }
        // 扣款已发生、发放未落地；客户端按契约用同一 clientReqId 重试即可续做。
        assert.equal(await balanceOf(uid), 0)
        assert.equal(await itemCountOf(uid, 29), 0)

        const recovered = (await call(uid, 'shop.purchase', { clientReqId: 'gr-1', sku: 'shop.frag29x10' })) as {
            status: string
            balance: number
        }
        assert.equal(recovered.status, 'done')
        assert.equal(recovered.balance, 0)
        // 只扣一次、只发一次。
        assert.equal(await balanceOf(uid), 0)
        assert.equal(await itemCountOf(uid, 29), 10)

        // 第二段：发放**已经成功**之后才失败（这里注入领域收据写入失败）。
        // 上一段的注入点在发放之前，证明不了发放回执是否承重；这一段让 handler 在发放成功后再跑一遍，
        // 此时唯一挡住「再发一次」的就是按 (uid, sId, opId, grantIndex) 的回执——没有它道具会翻倍。
        await new ShopNativeLobbyStore().credit(uid, SID, 100)
        const originalHSet = redis.hSet.bind(redis)
        let failDoneOnce = true
        redis.hSet = async (key: string, field: string, value: string) => {
            if (failDoneOnce && key === 'nativeLobby:shop:operations:v1' && value.includes('"status":"done"')) {
                failDoneOnce = false
                throw new Error('receipt storage unavailable')
            }
            return originalHSet(key, field, value)
        }
        try {
            await assert.rejects(
                () => call(uid, 'shop.purchase', { clientReqId: 'gr-2', sku: 'shop.frag29x10' }),
                /receipt storage unavailable/,
            )
        } finally {
            redis.hSet = originalHSet
        }
        // 这一轮的发放确实落地了（+10，不是 0），扣款只发生一次。
        assert.equal(await itemCountOf(uid, 29), 20)
        assert.equal(await balanceOf(uid), 0)

        const replayed = (await call(uid, 'shop.purchase', { clientReqId: 'gr-2', sku: 'shop.frag29x10' })) as {
            status: string
            balance: number
        }
        assert.equal(replayed.status, 'done')
        assert.equal(replayed.balance, 0)
        // handler 重跑：不再扣款，也不再发一遍。
        assert.equal(await itemCountOf(uid, 29), 20)
        assert.equal(await balanceOf(uid), 0)
    })

    it('executes income through generated Actions and keeps idempotent replay on the Bean path', async () => {
        const uid = 'contract-income-bean'
        const internalUid = await identities.resolve(uid, SID)
        const fakeUser = {
            id: internalUid,
            sId: SID,
            lv: 1,
            copper: 200,
            lastCopperIncomeTime: timestamp(),
            offlineCopperPending: 50,
            offlineCopperSecondsPending: 10,
            nextDayTime: Number.MAX_SAFE_INTEGER,
            loginDays: 0,
        }
        const userBean = User as unknown as { load: unknown }
        const savedLoad = userBean.load
        userBean.load = async () => fakeUser
        try {
            const context = await connect(uid)
            assert.deepEqual(await rpc(context, 'income.getPending', {}), {
                level: 1,
                intervalSeconds: 5,
                perInterval: 100,
                offlineSeconds: 10,
                offlineCopper: 50,
                copper: 200,
            })
            assert.deepEqual(await rpc(context, 'income.settleOnline', {}), { copper: 0, balance: 200 })
            assert.deepEqual(await rpc(context, 'income.claimOffline', { clientReqId: 'income-bean-1' }), {
                copper: 50,
                offlineSeconds: 10,
                balance: 250,
            })
            assert.equal(fakeUser.copper, 250)
            assert.equal(fakeUser.offlineCopperPending, 0)
            assert.equal(fakeUser.offlineCopperSecondsPending, 0)
            assert.deepEqual(await rpc(context, 'income.claimOffline', { clientReqId: 'income-bean-1' }), {
                copper: 50,
                offlineSeconds: 10,
                balance: 250,
            })
            assert.deepEqual(await rpc(context, 'income.claimOffline', { clientReqId: 'income-bean-2' }), {
                copper: 0,
                offlineSeconds: 0,
                balance: 250,
            })
        } finally {
            userBean.load = savedLoad
        }
    })

    it('replays the committed sync together with the idempotent result', async () => {
        // 幂等重放只回结果、不回 sync，客户端重试拿到的响应里就没有那次变更：服务端已经改完、
        // 客户端永远补不上。这正是 BF5 要消灭的形态，所以重放面必须逐字段比对 sync。
        //
        // ⚠ 本用例把 `User.load` 换成了普通对象（不是真 Bean），diff 面因此没有变更可读；
        // 这里直接替身 `ModSync.autoGetModChanged` 给出「提交点读到的差异」。真实 Bean diff
        // 走同一条回执链的证明在 `pnpm verify:native-lobby-live` 的 income 场景里。
        const uid = 'contract-income-sync-replay'
        const internalUid = await identities.resolve(uid, SID)
        const fakeUser = {
            id: internalUid,
            sId: SID,
            lv: 1,
            copper: 0,
            lastCopperIncomeTime: timestamp(),
            offlineCopperPending: 50,
            offlineCopperSecondsPending: 10,
            nextDayTime: Number.MAX_SAFE_INTEGER,
            loginDays: 0,
        }
        const userBean = User as unknown as { load: unknown }
        const savedLoad = userBean.load
        const savedChanged = ModSync.autoGetModChanged
        userBean.load = async () => fakeUser
        ModSync.autoGetModChanged = () => ({ [internalUid]: { versions: { user: 3 }, copper: 50 } })
        try {
            const context = await connect(uid)
            const claimed = await rpcOutcome(context, 'income.claimOffline', { clientReqId: 'income-sync-1' })
            assert.deepEqual(claimed.data, { copper: 50, offlineSeconds: 10, balance: 50 })
            assert.deepEqual(claimed.sync, { mods: { versions: { user: 3 }, copper: 50 } })

            const replayed = await rpcOutcome(context, 'income.claimOffline', { clientReqId: 'income-sync-1' })
            assert.deepEqual(replayed.data, claimed.data)
            assert.deepEqual(replayed.sync, claimed.sync, '幂等重放必须连 sync 一起回')
        } finally {
            userBean.load = savedLoad
            ModSync.autoGetModChanged = savedChanged
        }
    })

    it('fans a released session out to the owning module so the offline cleanup runs exactly once', async () => {
        // `onReleased` 是 P6 删除旧 `SessionMgr` 断线回调后的替代入口：会话结束的离线收尾由所属
        // 模块贡献。只注册不消费会让收尾静默失效，所以这里走生产装配，证明「装配真的把回调扇出到
        // 模块，且带的是被释放会话的内部 uid」。测试环境没有 Bean 持久化 Redis，只桩掉 `User.load`
        // 这一层存储边界，扇出与收尾调用仍走生产代码。
        const uid = 'contract-release'
        const internalUid = await identities.resolve(uid, SID)
        const loaded: number[] = []
        const cleaned: number[] = []
        const userBean = User as unknown as { load: unknown }
        const savedLoad = userBean.load
        const savedLeave = UserSessionLifecycle.leave
        userBean.load = async (id: number) => {
            loaded.push(id)
            return { id, sId: SID }
        }
        UserSessionLifecycle.leave = async (user) => {
            cleaned.push(user.id)
        }
        try {
            await assembly.onReleased({ uid, sId: SID, internalUid })
        } finally {
            userBean.load = savedLoad
            UserSessionLifecycle.leave = savedLeave
        }
        // 模块拿到的必须是内部 uid（字符串 uid 不能当 Bean 主键），且离线收尾恰好一次。
        assert.deepEqual(loaded, [internalUid])
        assert.deepEqual(cleaned, [internalUid])
    })

    it('exercises every route this project owns at least once', () => {
        // 这条断言是「局部闭环不能宣称全量完成」的机器化版本：漏测一条就失败。
        // ⚠ 期望集是「本项目拥有的路由」，不是 shared 声明面 —— 归属另一条通道的（见
        // NativeLobbyPendingRoutes）在这里既没有 handler、也不会被驱动。
        const pending = new Set(Object.keys(NativeLobbyPendingRoutes))
        const owned = ALL_LOBBY_RPC_TYPES.filter((type) => !pending.has(type))
        assert.deepEqual(
            owned.filter((type) => !exercised.has(type)),
            [],
        )
        // 反向：登记为「归属另一条通道」的路由一条都不许被驱动过（被驱动 = 其实有 handler = 登记陈旧）。
        assert.deepEqual(
            [...exercised].filter((type) => pending.has(type)),
            [],
        )
    })

    /** 认证成功后的上下文：真实身份解析 + 建档钩子，和监听进程装配路径一致。 */
    async function connect(externalUid: string, sId = SID) {
        const internalUid = await identities.resolve(externalUid, sId)
        await assembly.onAuthenticated(externalUid, internalUid, sId)
        return { uid: externalUid, sId, sessionEpoch: 'e1', connectionId: `c-${externalUid}`, ip: '127.0.0.1' }
    }

    async function call(uid: string, type: LobbyRpcType, payload: unknown): Promise<unknown> {
        return rpc(await connect(uid), type, payload)
    }

    /**
     * 用**已经拿到的**上下文发一条 RPC。
     *
     * 多数用例走 `call` 就够了；但只要某个模块在 `onAuthenticated` 上有副作用（income 的登录
     * 离线暂存就是），`call` 的隐式重新认证就会在每条 RPC 前再跑一次那个副作用，把被测状态改掉。
     * 那种用例必须先 `connect` 一次、再用本函数连续发多条 RPC。
     */
    async function rpc(context: LobbyConnectionContext, type: LobbyRpcType, payload: unknown): Promise<unknown> {
        exercised.add(type)
        const result = await assembly.routes.execute(type, context, payload)
        // 出站必须过 shared 响应 validator；本地「看起来对」不算契约通过。
        // ⚠ `execute` 返回的是传输层 `LobbyRouteOutcome`（带 sync），契约校验的是里面的 data。
        return assembly.wire.validateResponse(type, lobbyOutcomeData(result))
    }

    /**
     * 与 `rpc` 走同一条路径，但返回**未解包**的路由结果，供断言传输层载荷（`sync`）的用例使用。
     *
     * 出站响应仍然过 shared validator：看 sync 不是跳过契约校验的理由。
     */
    async function rpcOutcome(
        context: LobbyConnectionContext,
        type: LobbyRpcType,
        payload: unknown,
    ): Promise<LobbyRouteOutcome> {
        exercised.add(type)
        const result = await assembly.routes.execute(type, context, payload)
        assembly.wire.validateResponse(type, lobbyOutcomeData(result))
        assert.equal(isLobbyRouteOutcome(result), true, `${type} 的传输层结果必须是 LobbyRouteOutcome`)
        return result as LobbyRouteOutcome
    }

    async function fails(uid: string, type: LobbyRpcType, payload: unknown, code: string): Promise<void> {
        exercised.add(type)
        const context = await connect(uid)
        await assert.rejects(
            () => assembly.routes.execute(type, context, payload),
            (error: { code?: string }) => {
                assert.equal(error?.code, code, `${type} 期望 ${code}，实际 ${JSON.stringify(error)}`)
                return true
            },
        )
    }

    async function balanceOf(uid: string): Promise<number> {
        return Number((await redis.hGet('nativeLobby:shop:balance:v1', `${SID}:${uid}`)) ?? 0)
    }

    /**
     * 道具账本的**物理**读取：断言直接落在存储上，而不是复用生产读函数——
     * 否则生产代码把读写指向同一个错键时，测试会跟着一起错。键名与
     * `NativeLobbyGrants.ITEMS_KEY` 必须一致，改键就是改这条断言。
     */
    async function itemCountOf(uid: string, itemId: number): Promise<number> {
        return Number((await redis.hGet('nativeLobby:grants:items:v1', `${SID}:${uid}:${itemId}`)) ?? 0)
    }

    /** 未消费的 creation ticket 数：配额闸按这个集合计数，所以断言必须读同一个结构。 */
    async function ticketRecordCount(uid: string): Promise<number> {
        return redis.zCard(roomTicketQuotaKey(SID, uid))
    }

    /**
     * 以 **GameRoom 侧**的形状写入一条 active 邀请码租约（Lobby 只读、不写）。
     * 字段集与 `apps/server` 的 `INVITE_CODE_ALLOCATE` 写入值一致——少一个字段就会被
     * `readInviteLease` 判成腐坏并折叠，所以这里刻意逐字段写全。
     */
    async function seedInviteLease(
        code: string,
        overrides: Partial<{
            roomId: string
            mode: string
            modeVersion: number
            profile: string
            sId: number
            generation: number
        }> = {},
    ): Promise<void> {
        await redis.set(
            roomInviteCodeKey(SID, code),
            JSON.stringify({
                v: 1,
                state: 'active',
                roomId: 'room-abc',
                mode: 'privateFixture',
                modeVersion: 2,
                profile: 'private',
                sId: SID,
                generation: 1,
                ...overrides,
            }),
        )
    }

    /**
     * 播种衣柜档。
     *
     * 走 store 自己的**存储契约**（`SnakeCosmeticNativeLobbyStore` 的 `profilesKey` / `userField` /
     * `serialize`），⛔ 不在这里另抄一份键名与字段形状：夹具与生产写路径共用同一份定义，store 改形状
     * 时这里会跟着变，不会静默落后成「夹具写进去的东西 store 读不出来」（那种症状是 `read()` 抛
     * `USER_DATA_LOST`，看着像业务坏了）。
     * 等 snakeCosmetic 按施工单的后续迁移清单迁到 Bean + Action 后，这里应改为走生产写路径。
     */
    async function seedWardrobe(
        uid: string,
        value: { owned: number[]; fragments: Record<number, number> },
    ): Promise<void> {
        await redis.hSet(
            SnakeCosmeticNativeLobbyStore.profilesKey,
            SnakeCosmeticNativeLobbyStore.userField(uid, SID),
            SnakeCosmeticNativeLobbyStore.serialize({
                equippedSkinId: value.owned[0],
                ownedSkinIds: value.owned,
                fragmentBalances: Object.fromEntries(
                    SNAKE_FRAGMENT_SKIN_IDS.map((id) => [String(id), value.fragments[id] ?? 0]),
                ),
            }),
        )
    }

    /**
     * 播种 `count` 条已到期行军（到达目标互不相同，从 `startTile` 起）。
     * 行军记录与到期索引都是权威数据，由派遣路径一起写入；这里只把到达时间挪到过去，
     * 以便在不 sleep 的前提下驱动结算路径。
     */
    async function seedArrivedMarches(uid: string, count: number, startTile: number): Promise<void> {
        await connect(uid)
        for (let index = 0; index < count; index += 1) {
            const marchId = `march-${uid}-${index}`
            await redis.hSet(
                'nativeLobby:slg:marches:v1',
                `${SID}:${marchId}`,
                JSON.stringify({
                    marchId,
                    uid,
                    fromTile: 0,
                    toTile: startTile + index,
                    departAt: 1,
                    arriveAt: 2,
                    status: 'marching',
                }),
            )
            redis.zAdd(`nativeLobby:slg:due:v1:${SID}`, 2, marchId)
        }
    }
})

function emptyBoard() {
    return Array.from({ length: 16 }, (_value, tile) => ({ tile, ownerUid: '', power: 0 }))
}

function chunkRect() {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
}
