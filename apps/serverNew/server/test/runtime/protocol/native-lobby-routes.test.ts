import assert from 'node:assert/strict'
import path from 'node:path'
import { KIT_CATALOG } from '../../../generated/lobby-contract/native/kits.generated'
import { LOBBY_RPC_ROUTE_MODES as HOST_ROUTE_MODES } from '../../../generated/lobby-contract/protocol/lobbyRpc'
import {
    DiffArray,
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
} from '../../../generated/lobby-contract/native/lobbyRpc/index.generated'
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
    let redis: ReturnType<typeof installFakeCenterRedis>

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
        const hostModes = modes.filter(([type]) => Object.hasOwn(HOST_ROUTE_MODES, type))
        assert.equal(hostModes.filter(([, mode]) => mode === 'idempotent-write').length, 21)
        assert.equal(hostModes.filter(([, mode]) => mode === 'natural-write').length, 6)
        assert.equal(hostModes.filter(([, mode]) => mode === 'query').length, 15)
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

    it('runs installed native kits through their packaged route scenarios', async () => {
        for (const kit of KIT_CATALOG) {
            if (kit.serverRuntime !== 'serverNew' || kit.domains.length === 0) continue
            const verify = require(path.resolve(process.cwd(), '../kits', kit.id, 'verify/routes.cjs'))
            const contexts = new Map<string, LobbyConnectionContext>()
            const contextFor = async (uid: string) => {
                // Kit route vectors consume an authenticated identity; host auth is tested separately.
                if (!contexts.has(uid))
                    contexts.set(uid, {
                        uid,
                        sId: SID,
                        internalUid: await identities.resolve(uid, SID),
                        sessionEpoch: 'kit-vector',
                        connectionId: `kit-${uid}`,
                        ip: '127.0.0.1',
                    })
                return contexts.get(uid)!
            }
            await verify({
                call: async (uid: string, type: LobbyRpcType, payload: unknown) =>
                    rpc(await contextFor(uid), type, payload),
                fails: async (uid: string, type: LobbyRpcType, payload: unknown, code: string) =>
                    fails(await contextFor(uid), type, payload, code),
                redis,
                sid: SID,
                contractRoot: path.resolve(process.cwd(), 'generated/lobby-contract'),
            })
        }
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
})
