import assert from 'node:assert/strict'
import {
    GameError,
    isLobbyRouteOutcome,
    PlatformLineInfo,
    RedisService,
    RouteAction,
    type LobbyConnectionContext,
    type LobbyRouteOutcome,
} from '@arthropoda/game-engine'
import type { LobbyRpcType } from '../../../generated/lobby-contract/protocol/lobbyRpc'
import { NativeLobbyIdentityMap } from '../../../src/runtime/identity/NativeLobbyIdentityMap'
import { assembleNativeLobbyRoutes, type NativeLobbyRouteAssembly } from '../../../src/runtime/lobby/NativeLobbyRoutes'
import { GameModuleCatalog } from '../../../src/startup/GameModuleCatalog'
import { User } from '../../../src/modules/user/bean/User'
import { installFakeCenterRedis, type FakeCenterRedis } from '../../support/FakeCenterRedis'
import { lobbyOutcomeData } from '../../support/lobbyOutcome'

/**
 * 「原生 Lobby 业务框架整合」（`humanDocs/业务框架整合.md`）的**现状红测**。
 *
 * BF0 的退出条件是「有可重复的红测证明当前 income 使用第二套路由和存储」。所以本文件
 * **故意是红的**：三条断言钉的都是施工单要求的目标形态，BF4–BF7 落地后必须自然转绿。
 *
 * ⛔ 不允许为了让套件变绿而放宽/删除这里的断言，也不允许把它们改成源码字符串位置断言
 * （要证明「不再使用第二套框架」必须落在**行为**上：模块贡献表、真实 Redis 键、真实路由结果）。
 * ⛔ 也不要在这些断言绿之前宣称整合完成。
 */

const SID = 11
/** income 第二套框架的账户键；施工单 §8 要求它连同运行时读写一起删除。 */
const LEGACY_INCOME_ACCOUNT_KEY = 'nativeLobby:income:account:v1'

describe('business framework integration (BF0 freeze)', () => {
    let redis: FakeCenterRedis
    let assembly: NativeLobbyRouteAssembly
    let identities: NativeLobbyIdentityMap
    let savedGlobals: Record<string, unknown> = {}
    let savedSave: typeof RedisService.save
    let savedProcessRouter: typeof RouteAction.processRouter
    let savedPlatformIdMap: Record<string, number>
    let savedUserLoad: unknown
    let savedUserLoadOnlyRead: unknown

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
                clientPort: 42001,
                internalPort: 42002,
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
        const userBean = User as unknown as { load: unknown; loadOnlyRead: unknown }
        savedUserLoad = userBean.load
        savedUserLoadOnlyRead = userBean.loadOnlyRead
        userBean.load = async () => undefined
        userBean.loadOnlyRead = async () => undefined
        redis = installFakeCenterRedis()
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
        const userBean = User as unknown as { load: unknown; loadOnlyRead: unknown }
        userBean.load = savedUserLoad
        userBean.loadOnlyRead = savedUserLoadOnlyRead
        RouteAction.callGroups.clear()
        PlatformLineInfo.register(savedPlatformIdMap)
        for (const [name, value] of Object.entries(savedGlobals)) {
            if (value === undefined) delete (globalThis as Record<string, unknown>)[name]
            else (globalThis as Record<string, unknown>)[name] = value
        }
    })

    it('serves income routes from the generated Action registry instead of a hand-written module route', () => {
        // 目标形态：schema 声明的路由由生成的 Action 提供，业务模块不再逐条贡献原生 Lobby 路由
        // （施工单 §2「不新增 Lobby 专用业务接口」、BF4「registry 不再由业务模块逐条注册」）。
        const contributed = GameModuleCatalog.systems.nativeLobby.entries
            .filter((entry) => entry.moduleName === 'income')
            .map((entry) => entry.contribution.name)
        assert.deepEqual(
            contributed,
            [],
            'income 不得再手工注册原生 Lobby 路由（路由归属由 schema + 生成的 Actions 决定）',
        )
    })

    it('keeps income state out of the second account key so the User Bean stays the only source', async () => {
        // 目标形态：income 的等级/铜币/离线暂存全部落在 `User` Bean（BF6/BF7）。
        // 所以「认证 + 领取」这条完整链路上，第二套账户键一次都不能被创建或改写。
        const uid = 'freeze-income-account'
        const internalUid = await identities.resolve(uid, SID)
        const field = `${SID}:${internalUid}`
        const userBean = User as unknown as { load: unknown; loadOnlyRead: unknown }
        const savedLoad = userBean.load
        const savedLoadOnlyRead = userBean.loadOnlyRead
        userBean.load = async () => undefined
        userBean.loadOnlyRead = async () => undefined
        try {
            await assembly.onAuthenticated(uid, internalUid, SID)
            assert.equal(
                await redis.hGet(LEGACY_INCOME_ACCOUNT_KEY, field),
                null,
                'income 的登录暂存不得再写第二套账户键',
            )

            await rpc(uid, 'income.claimOffline', { clientReqId: 'freeze-income-1' })
            assert.equal(
                await redis.hGet(LEGACY_INCOME_ACCOUNT_KEY, field),
                null,
                'income 的领取路径不得再读写第二套账户键',
            )
        } finally {
            userBean.load = savedLoad
            userBean.loadOnlyRead = savedLoadOnlyRead
        }
    })

    it('carries the committed Bean change back through the native Lobby route result', async () => {
        // 目标形态（施工单 §4「保存成功后响应包含首次执行结果，reply.sync 包含已提交的公开 Bean 变化」）：
        // 路由适配器必须把 `result.sync` 原样交给传输层，⛔ 不得在适配器里丢掉它。
        // 这条断言同时是「谁把 sync 吞了」的机器化判据：一旦适配器只回 `lobbyRouteOutcome(data)`，它就红。
        const uid = 'freeze-route-sync'
        const context = await connect(uid)
        const outcome = await rpcOutcome(context, 'user.updateProfile', {
            clientReqId: 'freeze-sync-1',
            nickname: '阿呆',
        })

        const sync = outcome.sync as { mods?: Record<string, unknown> } | undefined
        assert.ok(sync, '路由适配器丢弃了 result.sync：已提交的 Bean 变化必须跟着本次响应回给发起者')
        const nativeUser = sync.mods?.nativeUser as { nickname?: string } | undefined
        assert.equal(nativeUser?.nickname, '阿呆', 'sync 必须携带本次已提交的公开字段')
    })

    /** 认证成功后的上下文：与监听进程装配路径一致。 */
    async function connect(externalUid: string, sId = SID): Promise<LobbyConnectionContext> {
        const internalUid = await identities.resolve(externalUid, sId)
        await assembly.onAuthenticated(externalUid, internalUid, sId)
        return {
            uid: externalUid,
            sId,
            sessionEpoch: 'e1',
            connectionId: `c-${externalUid}`,
            ip: '127.0.0.1',
        }
    }

    /** 驱动一条路由并返回业务数据（出站响应仍过 shared validator）。 */
    async function rpc(uid: string, type: LobbyRpcType, payload: unknown): Promise<unknown> {
        return lobbyOutcomeData(await rpcOutcome(await connect(uid), type, payload))
    }

    /** 驱动一条路由并返回**未解包**的传输层结果，供断言 `sync` 的用例使用。 */
    async function rpcOutcome(
        context: LobbyConnectionContext,
        type: LobbyRpcType,
        payload: unknown,
    ): Promise<LobbyRouteOutcome> {
        const result = await assembly.routes.execute(type, context, payload)
        assembly.wire.validateResponse(type, lobbyOutcomeData(result))
        assert.equal(isLobbyRouteOutcome(result), true, `${type} 的传输层结果必须是 LobbyRouteOutcome`)
        return result as LobbyRouteOutcome
    }
})
