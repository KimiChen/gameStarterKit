import assert from 'node:assert/strict'
import {
    Call,
    DiffArray,
    GameError,
    MessageHelper,
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
import { ActionGameDemo } from '../../../src/modules/gameDemo/action/ActionGameDemo'
import { ActionGameDemoBossTick } from '../../../src/modules/gameDemo/action/ActionGameDemoBossTick'
import { ActionGameDemoTask } from '../../../src/modules/gameDemo/action/ActionGameDemoTask'
import { GameDemoBossLobby } from '../../../src/modules/gameDemo/bean/GameDemoBossLobby'
import { GameDemoBossRoom } from '../../../src/modules/gameDemo/bean/GameDemoBossRoom'
import { GameDemoGuildDirectory } from '../../../src/modules/gameDemo/bean/GameDemoGuildDirectory'
import { GameDemoPlayer } from '../../../src/modules/gameDemo/bean/GameDemoPlayer'
import { GameDemoSeason } from '../../../src/modules/gameDemo/bean/GameDemoSeason'
import { ActionGameDemoSeasonScore } from '../../../src/modules/gameDemo/action/ActionGameDemoSeasonScore'
import { ActionGameDemoSeasonTick } from '../../../src/modules/gameDemo/action/ActionGameDemoSeasonTick'
import { QueuedLocalAction } from '../../../src/runtime/action/QueuedLocalAction'
import { User } from '../../../src/modules/user/bean/User'
import { UserSessionLifecycle } from '../../../src/modules/user/lifecycle/UserSessionLifecycle'
import { NativeLobbyIdentityMap } from '../../../src/runtime/identity/NativeLobbyIdentityMap'
import { NativeLobbyPendingRoutes } from '../../../src/runtime/lobby/NativeLobbyPendingRoutes'
import { NativeLobbyRouteRegistry } from '../../../src/runtime/lobby/NativeLobbyRouteRegistry'
import { assembleNativeLobbyRoutes, type NativeLobbyRouteAssembly } from '../../../src/runtime/lobby/NativeLobbyRoutes'
import { installFakeCenterRedis } from '../../support/FakeCenterRedis'
import { lobbyOutcomeData } from '../../support/lobbyOutcome'

const SID = 7
const exercised = new Set<string>()

describe('native Lobby owned route contract', () => {
    let assembly: NativeLobbyRouteAssembly
    let identities: NativeLobbyIdentityMap
    let savedGlobals: Record<string, unknown> = {}
    let savedSave: typeof RedisService.save
    let savedProcessRouter: typeof RouteAction.processRouter
    let savedPlatformIdMap: Record<string, number>

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
        installFakeCenterRedis({ player: true })
        identities = new NativeLobbyIdentityMap()
        assembly = assembleNativeLobbyRoutes({
            identities,
            registerCharacter: async () => undefined,
            pushToUser: async () => true,
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

    it('treats routes owned by apps/server as explicit ownership instead of a local backlog', () => {
        const unregistered = ALL_LOBBY_RPC_TYPES.filter((type) => !assembly.routes.has(type))
        assert.deepEqual([...unregistered].sort(), Object.keys(NativeLobbyPendingRoutes).sort())
        for (const type of unregistered) {
            assert.notEqual(NativeLobbyPendingRoutes[type]?.trim(), '', `${type} 的登记必须写明归属原因`)
        }
        assert.doesNotThrow(() => assembly.routes.assertComplete())
    })

    it('rejects missing owned routes, stale ownership entries and undeclared registrations', () => {
        const missing = new NativeLobbyRouteRegistry({ validateResponse: (_route, response) => response })
        const owned = ALL_LOBBY_RPC_TYPES.filter(
            (type) => !Object.prototype.hasOwnProperty.call(NativeLobbyPendingRoutes, type),
        )
        for (const type of owned) {
            if (type !== 'income.getPending') missing.register(type, async () => ({}))
        }
        assert.throws(() => missing.assertComplete(), /unowned missing=\[income\.getPending\]/)

        const stale = new NativeLobbyRouteRegistry({ validateResponse: (_route, response) => response })
        for (const type of ALL_LOBBY_RPC_TYPES) stale.register(type, async () => ({}))
        assert.throws(() => stale.assertComplete(), /stale pending=\[/)
        stale.register('user.notARoute' as LobbyRpcType, async () => ({}))
        assert.throws(() => stale.assertComplete(), /unexpected=\[user\.notARoute\]/)
    })

    it('keeps execution modes sourced only from shared', () => {
        const modes = Object.entries(LOBBY_RPC_ROUTE_MODES)
        assert.equal(modes.length, ALL_LOBBY_RPC_TYPES.length)
        assert.equal(modes.filter(([, mode]) => mode === 'idempotent-write').length, 34)
        assert.equal(modes.filter(([, mode]) => mode === 'natural-write').length, 7)
        assert.equal(modes.filter(([, mode]) => mode === 'query').length, 24)
    })

    it('executes income only through the User Bean lifecycle', async () => {
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
            assert.deepEqual(await rpc(context, 'income.claimOffline', { clientReqId: 'income-bean-1' }), {
                copper: 50,
                offlineSeconds: 10,
                balance: 250,
            })
        } finally {
            userBean.load = savedLoad
        }
    })

    it('recruits heroes through generated Bean Actions and charges copper exactly once', async () => {
        const uid = 'contract-hero-recruit'
        const internalUid = await identities.resolve(uid, SID)
        const fakeUser = {
            id: internalUid,
            sId: SID,
            lv: 1,
            copper: 1_000,
            recruitedHeroIds: new DiffArray<int>(),
            lastCopperIncomeTime: timestamp(),
            offlineCopperPending: 0,
            offlineCopperSecondsPending: 0,
            nextDayTime: Number.MAX_SAFE_INTEGER,
            loginDays: 0,
        }
        const userBean = User as unknown as { load: unknown }
        const savedLoad = userBean.load
        userBean.load = async () => fakeUser
        try {
            const context = await connect(uid)
            const catalog = (await rpc(context, 'heroRecruit.getCatalog', {})) as {
                snapshot: { copper: number; ownedHeroIds: number[] }
            }
            assert.equal(catalog.snapshot.copper, 1_000)
            assert.deepEqual(catalog.snapshot.ownedHeroIds, [])

            const bought = await rpc(context, 'heroRecruit.buy', { clientReqId: 'hero-1', heroId: 1001 })
            assert.equal(fakeUser.copper, 500)
            assert.deepEqual([...fakeUser.recruitedHeroIds], [1001])
            assert.deepEqual(await rpc(context, 'heroRecruit.buy', { clientReqId: 'hero-1', heroId: 1001 }), bought)
            assert.equal(fakeUser.copper, 500)
            await fails(
                context,
                'heroRecruit.buy',
                { clientReqId: 'hero-2', heroId: 1002 },
                'HERO_RECRUIT_INSUFFICIENT_COPPER',
            )
        } finally {
            userBean.load = savedLoad
        }
    })

    it('plays gameDemo through generated Bean Actions and the reliable queue', async () => {
        const users = new Map<number, Record<string, unknown>>()
        const userBean = User as unknown as { load: unknown }
        const savedLoad = userBean.load
        const savedRpc = QueuedLocalAction.rpc
        const savedDevTools = process.env.GAME_DEMO_DEV_TOOLS
        const queued: Array<{ req: { uid: number; batchId: number; score: number; at: number }; uid: number }> = []
        userBean.load = async (id: number) => users.get(id)
        QueuedLocalAction.rpc = (async (_action: unknown, req: never, uid: number) => {
            queued.push({ req, uid })
            return []
        }) as typeof QueuedLocalAction.rpc
        process.env.GAME_DEMO_DEV_TOOLS = '1'
        // 单测进程没有提交上下文（Bean 变更不会落盘）；用进程内实例表模拟「提交后下一次 Action 重新加载」。
        const restoreBeans = installGameDemoBeanStore()
        const player = async (name: string) => {
            const internalUid = await identities.resolve(name, SID)
            users.set(internalUid, {
                id: internalUid,
                sId: SID,
                lv: 1,
                copper: 0,
                lastCopperIncomeTime: timestamp(),
                offlineCopperPending: 0,
                offlineCopperSecondsPending: 0,
                nextDayTime: Number.MAX_SAFE_INTEGER,
                loginDays: 0,
            })
            return { context: await connect(name), uid: internalUid, user: users.get(internalUid)! }
        }
        const background = async (uid: number, route: string, req: object, actionClass: never) => {
            const result = await MessageHelper.syncDoAction(uid, SID, new Call(route, req), actionClass)
            assert.equal(result.isSucc, true, route)
        }
        try {
            const owner = await player('contract-game-demo-owner')
            const member = await player('contract-game-demo-member')
            assert.deepEqual(await rpc(owner.context, 'gameDemo.assets', {}), {
                initialized: false,
                gold: 0,
                items: { herb: 0, dew: 0, pill: 0, finePill: 0 },
            })
            await fails(
                owner.context,
                'gameDemo.buy',
                { clientReqId: 'buy-0', product: 'herb', count: 1 },
                'GAME_DEMO_NOT_INITIALIZED',
            )
            const initialized = await rpc(owner.context, 'gameDemo.initialize', { clientReqId: 'init-1' })
            assert.deepEqual(initialized, {
                initialized: true,
                gold: 5000,
                items: { herb: 0, dew: 0, pill: 100, finePill: 100 },
            })
            assert.deepEqual(await rpc(owner.context, 'gameDemo.initialize', { clientReqId: 'init-2' }), initialized)
            assert.equal(owner.user.copper, 5000, '金币记入宿主 User.copper')

            const mailbox = (await rpc(owner.context, 'gameDemo.mailList', {})) as { mails: { id: number }[] }
            assert.equal(mailbox.mails.length, 1)
            await rpc(owner.context, 'gameDemo.mailRead', { mailId: mailbox.mails[0].id })
            const claimed = (await rpc(owner.context, 'gameDemo.mailClaim', {
                clientReqId: 'claim-1',
                mailId: mailbox.mails[0].id,
            })) as { assets: { gold: number } }
            assert.equal(claimed.assets.gold, 5100)

            await rpc(owner.context, 'gameDemo.shop', {})
            await rpc(owner.context, 'gameDemo.buy', { clientReqId: 'buy-1', product: 'herb', count: 20 })
            const bought = (await rpc(owner.context, 'gameDemo.buy', {
                clientReqId: 'buy-2',
                product: 'dew',
                count: 10,
            })) as { gold: number; items: { herb: number; dew: number } }
            assert.deepEqual([bought.gold, bought.items.herb, bought.items.dew], [4700, 20, 10])
            assert.equal(owner.user.copper, 4700)

            await rpc(owner.context, 'gameDemo.heroGet', {})
            const upgraded = (await rpc(owner.context, 'gameDemo.heroUpgrade', {
                clientReqId: 'hero-1',
                pill: 'normal',
                count: 10,
            })) as { hero: { level: number; attack: number }; consumed: number }
            assert.deepEqual([upgraded.hero.level, upgraded.hero.attack, upgraded.consumed], [6, 35, 10])

            await fails(owner.context, 'gameDemo.seasonGet', {}, 'GAME_DEMO_SEASON_PENDING')
            await background(0, 'gameDemo/GameDemoSeasonTick', {}, ActionGameDemoSeasonTick as never)
            await rpc(owner.context, 'gameDemo.alchemyGet', {})
            const alchemy = (await rpc(owner.context, 'gameDemo.alchemyStart', {
                clientReqId: 'alchemy-1',
                count: 5,
            })) as { batch: { score: number } }
            assert.equal(queued.length, 1, '积分在提交后登记到可靠队列')
            await background(
                owner.uid,
                'gameDemo/GameDemoSeasonScore',
                queued[0].req,
                ActionGameDemoSeasonScore as never,
            )
            await background(
                owner.uid,
                'gameDemo/GameDemoSeasonScore',
                queued[0].req,
                ActionGameDemoSeasonScore as never,
            )
            const season = (await rpc(owner.context, 'gameDemo.seasonGet', {})) as {
                number: number
                myScore: number
                myRank: number
            }
            assert.deepEqual([season.myScore, season.myRank], [alchemy.batch.score, 1], '重复投递只计一次')
            const ended = (await rpc(owner.context, 'gameDemo.seasonEnd', {
                clientReqId: 'end-1',
                number: season.number,
            })) as { phase: string }
            assert.equal(ended.phase, 'settling')

            await rpc(member.context, 'gameDemo.initialize', { clientReqId: 'init-member' })
            await rpc(owner.context, 'gameDemo.guildCreate', { clientReqId: 'guild-1', name: '青云' })
            await rpc(owner.context, 'gameDemo.guildInvite', { clientReqId: 'guild-2', targetUid: member.uid })
            const invited = (await rpc(member.context, 'gameDemo.guildGet', {})) as { invitations: { id: number }[] }
            const joined = (await rpc(member.context, 'gameDemo.guildRespond', {
                clientReqId: 'guild-3',
                inviteId: invited.invitations[0].id,
                accept: true,
            })) as { guild: { members: number[] } }
            assert.deepEqual(joined.guild.members, [owner.uid, member.uid])
            const left = (await rpc(owner.context, 'gameDemo.guildLeave', { clientReqId: 'guild-4' })) as {
                guild: null
            }
            assert.equal(left.guild, null)

            await background(0, 'gameDemo/GameDemoBossTick', {}, ActionGameDemoBossTick as never)
            const bosses = (await rpc(owner.context, 'gameDemo.bossList', {})) as { rooms: { runNumber: number }[] }
            assert.equal(bosses.rooms.length, 3)
            const entered = (await rpc(owner.context, 'gameDemo.bossEnter', {
                clientReqId: 'boss-1',
                bossId: 'tiger',
            })) as { generation: number; room: { runNumber: number } }
            await rpc(owner.context, 'gameDemo.bossGet', { bossId: 'tiger' })
            const attacked = (await rpc(owner.context, 'gameDemo.bossAttack', {
                clientReqId: 'boss-2',
                bossId: 'tiger',
                runNumber: entered.room.runNumber,
                generation: entered.generation,
            })) as { appliedDamage: number; myDamage: number }
            assert.deepEqual([attacked.appliedDamage, attacked.myDamage], [35, 35], '伤害按英雄当前攻击力')
            const afterLeave = (await rpc(owner.context, 'gameDemo.bossLeave', {
                clientReqId: 'boss-3',
                bossId: 'tiger',
                generation: entered.generation,
            })) as { currentBossId: null }
            assert.equal(afterLeave.currentBossId, null)
        } finally {
            restoreBeans()
            userBean.load = savedLoad
            QueuedLocalAction.rpc = savedRpc
            if (savedDevTools === undefined) delete process.env.GAME_DEMO_DEV_TOOLS
            else process.env.GAME_DEMO_DEV_TOOLS = savedDevTools
        }
    })

    it('replays committed Bean sync with the idempotent result', async () => {
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
            const replayed = await rpcOutcome(context, 'income.claimOffline', { clientReqId: 'income-sync-1' })
            assert.deepEqual(replayed.data, claimed.data)
            assert.deepEqual(replayed.sync, claimed.sync)
        } finally {
            userBean.load = savedLoad
            ModSync.autoGetModChanged = savedChanged
        }
    })

    it('fans released sessions into the User Bean lifecycle once', async () => {
        const uid = 'contract-release'
        const internalUid = await identities.resolve(uid, SID)
        const loaded: number[] = []
        const cleaned: number[] = []
        const userBean = User as unknown as { load: unknown }
        const savedLoad = userBean.load
        const savedLeave = UserSessionLifecycle.leave
        userBean.load = async (id: number) => {
            loaded.push(id)
            // 离线保存经玩家 Owner 的 Action 执行：未到过天时间，避免 dayInit 访问 MySQL。
            return { id, sId: SID, nextDayTime: Number.MAX_SAFE_INTEGER }
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
        assert.deepEqual(loaded, [internalUid])
        assert.deepEqual(cleaned, [internalUid])
    })

    it('exercises every route still owned by serverNew', () => {
        const pending = new Set(Object.keys(NativeLobbyPendingRoutes))
        const owned = ALL_LOBBY_RPC_TYPES.filter((type) => !pending.has(type))
        assert.deepEqual(
            owned.filter((type) => !exercised.has(type)),
            [],
        )
        assert.deepEqual(
            [...exercised].filter((type) => pending.has(type)),
            [],
        )
    })

    async function connect(externalUid: string): Promise<LobbyConnectionContext> {
        const internalUid = await identities.resolve(externalUid, SID)
        await assembly.onAuthenticated(externalUid, internalUid, SID)
        return {
            uid: externalUid,
            internalUid,
            sId: SID,
            sessionEpoch: 'e1',
            connectionId: `c-${externalUid}`,
            ip: '127.0.0.1',
        }
    }

    async function rpc(context: LobbyConnectionContext, type: LobbyRpcType, payload: unknown): Promise<unknown> {
        exercised.add(type)
        const result = await assembly.routes.execute(type, context, payload)
        return assembly.wire.validateResponse(type, lobbyOutcomeData(result))
    }

    async function rpcOutcome(
        context: LobbyConnectionContext,
        type: LobbyRpcType,
        payload: unknown,
    ): Promise<LobbyRouteOutcome> {
        exercised.add(type)
        const result = await assembly.routes.execute(type, context, payload)
        assembly.wire.validateResponse(type, lobbyOutcomeData(result))
        assert.equal(isLobbyRouteOutcome(result), true)
        return result as LobbyRouteOutcome
    }

    async function fails(
        context: LobbyConnectionContext,
        type: LobbyRpcType,
        payload: unknown,
        code: string,
    ): Promise<void> {
        exercised.add(type)
        await assert.rejects(
            () => assembly.routes.execute(type, context, payload),
            (error: { code?: string }) => {
                assert.equal(error?.code, code)
                return true
            },
        )
    }
    /** gameDemo Bean 的进程内实例表：`load` / `loadOnlyRead` 返回同一实例，首次写入时登记新建实例。 */
    function installGameDemoBeanStore(): () => void {
        type BeanClass = { name: string; load: unknown; loadOnlyRead: unknown }
        const classes = [GameDemoPlayer, GameDemoSeason, GameDemoGuildDirectory, GameDemoBossLobby, GameDemoBossRoom]
        const beans = new Map<string, { id: number }>()
        const saved = classes.map((beanClass) => {
            const target = beanClass as unknown as BeanClass
            const original = { load: target.load, loadOnlyRead: target.loadOnlyRead }
            const read = async (id: number) => beans.get(`${target.name}:${id}`)
            target.load = read
            target.loadOnlyRead = read
            return () => Object.assign(target, original)
        })
        const task = ActionGameDemoTask as unknown as { loadOrCreate: unknown }
        const savedLoadOrCreate = task.loadOrCreate
        task.loadOrCreate = async (beanClass: new (id: number) => { id: number }, id = 1) => {
            const key = `${beanClass.name}:${id}`
            if (!beans.has(key)) {
                const created = new beanClass(id)
                created.id = id
                beans.set(key, created)
            }
            return beans.get(key)
        }
        const playerAction = ActionGameDemo.prototype as unknown as { loadOrCreatePlayer: unknown }
        const savedLoadOrCreatePlayer = playerAction.loadOrCreatePlayer
        playerAction.loadOrCreatePlayer = async function (this: { requireUser(): { id: number } }) {
            const uid = this.requireUser().id
            const key = `GameDemoPlayer:${uid}`
            if (!beans.has(key)) {
                const created = new GameDemoPlayer(uid)
                created.id = uid
                beans.set(key, created)
            }
            return beans.get(key)
        }
        return () => {
            for (const restore of saved) restore()
            task.loadOrCreate = savedLoadOrCreate
            playerAction.loadOrCreatePlayer = savedLoadOrCreatePlayer
        }
    }
})
