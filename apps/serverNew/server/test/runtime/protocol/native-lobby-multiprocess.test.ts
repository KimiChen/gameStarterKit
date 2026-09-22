import assert from 'node:assert/strict'
import { GameError, PlatformLineInfo, RedisService, RouteAction } from '@arthropoda/game-engine'
import type { LobbyRpcType } from '../../../generated/lobby-contract/protocol/lobbyRpc'
import { NativeLobbyIdentityMap } from '../../../src/runtime/identity/NativeLobbyIdentityMap'
import { NativeLobbyProcessRoutes } from '../../../src/runtime/lobby/NativeLobbyProcessRoutes'
import { NativeLobbyRouteRegistry } from '../../../src/runtime/lobby/NativeLobbyRouteRegistry'
import { assembleNativeLobbyRoutes, type NativeLobbyRouteAssembly } from '../../../src/runtime/lobby/NativeLobbyRoutes'
import { roomTicketQuotaKey } from '../../../src/modules/room/lobby/RoomInviteContract'
import {
    handleProcessPipeRequest,
    type ProcessPipeDependencies,
    type ProcessPipeRequest,
} from '../../../src/startup/processPipe'
import { installNativeLobbyProcessRouter } from '../../../src/startup/installNativeLobbyProcessRouter'
import type { RuntimeServerLike } from '../../../src/startup/runtimeTypes'
import { installFakeCenterRedis, type FakeCenterRedis } from '../../support/FakeCenterRedis'
import { lobbyOutcomeData } from '../../support/lobbyOutcome'

/**
 * 单进程与多进程的**同一组协议用例行为一致**（P5 验收）。
 *
 * 两条路径刻意只差一件事：
 * - `single`：监听进程就地执行，handler 拿到**真实连接上下文**（每次调用一条新连接，模拟重复登录/重连）；
 * - `forward`：监听进程照常进闸（幂等写）并分发，但带 `bindId` 的对象调用经进程边界交给
 *   目标 worker 执行——目标 worker 用**自己的**装配，handler 拿到的
 *   `sessionEpoch` / `connectionId` / `ip` 是刻意留空的（`forwardedContext`）。
 *
 * 所以这条测试同时验证三件事：
 * 1. 转发不改变结论——响应、字符串错误码、落库状态、推送目标逐条一致；
 * 2. 跨进程边界不丢可信身份——字符串 uid / sId 与就地执行完全相同；
 * 3. 没有 handler 依赖连接级字段——否则「留空」会立刻把结论改掉，而不是在生产上表现为
 *    「偶发只在新连接第一次生效」。
 *
 * 每条路径各自一份中心 Redis 假体：两条路径的状态必须**独立地**演化到同一个结果，
 * 而不是共用一份状态互相遮掩。多进程那一路的两个进程共用同一份 Redis 与同一条出站记录——
 * 真实宿主上它们本来就是两个进程，这里只是让「谁被唤醒、载荷是什么」有一个可比较的出口。
 */

const SID = 7
const PRIMARY_UID = 'mp-parity-primary'
const OTHER_UID = 'mp-parity-other'
const BIND_ID = 4242
const PRIVATE_ROOM_REQUEST = { mode: 'privateFixture', modeVersion: 2, profile: 'private' } as const

type Mode = 'single' | 'forward'

interface PushRecord {
    readonly uid: string
    readonly sId: number
    readonly type: string
    readonly data: unknown
}

type Outcome =
    { readonly ok: true; readonly res: unknown } | { readonly ok: false; readonly code: string; readonly msg: string }

interface World {
    readonly mode: Mode
    readonly redis: FakeCenterRedis
    readonly identities: NativeLobbyIdentityMap
    readonly assembly: NativeLobbyRouteAssembly
    readonly routes: NativeLobbyProcessRoutes
    readonly deps: ProcessPipeDependencies
    readonly pushes: PushRecord[]
    /**
     * 本进程真的往对端发过的进程间请求。
     *
     * 没有它，「两条路径结论一致」可能是**空转**的：如果 `bindId` 那一路根本没转发出去、
     * 就地执行完事，比较出来的仍然是一片绿。所以对等性断言必须同时证明转发真的发生过。
     */
    readonly forwards: ProcessPipeRequest[]
    /** 每次调用递增：单进程路径用它模拟「重复登录/重连拿到的是新连接」。 */
    connectionSeq: number
    /**
     * 多进程模式下的目标 worker 装配：与监听进程**彼此独立**（各自一份登记表与身份表），
     * 但共用中心 Redis 与同一条出站记录。
     */
    remote?: World
}

interface ProtocolCase {
    readonly name: string
    readonly uid: string
    readonly route: LobbyRpcType
    readonly payload: unknown
    /** 期望结论：`'ok'` 或字符串错误码。 */
    readonly expect: 'ok' | string
    /** 随机值/绝对时间不能逐字节比较，但形状与语义必须一致。 */
    readonly shape?: (res: any) => unknown
    /** 落库状态与推送目标断言；两条路径都必须满足同一组事实。 */
    readonly verify?: (world: World, pushes: readonly PushRecord[]) => Promise<void>
}

function createWorld(mode: Mode): World {
    return createWorldOn(installFakeCenterRedis({ player: true }), mode)
}

/**
 * 在**指定的**中心 Redis 上装一份进程内世界。
 *
 * 允许注入 Redis 是为了构造「监听进程 + 目标 worker」两个进程：它们的装配彼此独立，
 * 但幂等记录键在中心 Redis 上**跨进程共享**——这正是「闸被进了两次」能被观测到的原因。
 */
function createWorldOn(redis: FakeCenterRedis, mode: Mode): World {
    const world = buildWorld(redis, mode, [])
    if (mode === 'forward') {
        // 目标 worker：装配与身份表彼此独立，中心 Redis 与出站记录共享。
        world.remote = buildWorld(redis, mode, world.pushes)
    }
    return world
}

function buildWorld(redis: FakeCenterRedis, mode: Mode, pushes: PushRecord[]): World {
    const identities = new NativeLobbyIdentityMap()
    const assembly = assembleNativeLobbyRoutes({
        identities,
        registerCharacter: async () => undefined,
        // 两种模式都把「唤醒谁、载荷是什么」记在同一个出口。跨进程那一跳本身由
        // `process-pipe.test.ts` / `lobbyRole.test.ts` 覆盖，这里比较的是业务语义。
        pushToUser: async (uid, sId, type, data) => {
            pushes.push({ uid, sId, type, data })
            return true
        },
    })
    const routes = new NativeLobbyProcessRoutes()
    routes.install(assembly.routes)
    const deps: ProcessPipeDependencies = {
        executeLobbyRoute: (route, identity, payload) => routes.execute(route, identity, payload),
        executeInternalAction: async () => {
            throw new Error('协议用例集不使用 internal-action')
        },
        lookupUserConnection: async () => null,
        pushLobbyConnection: async () => false,
        kickLobbyConnection: () => false,
    }
    return { mode, redis, identities, assembly, routes, deps, pushes, forwards: [], connectionSeq: 0 }
}

async function authenticate(world: World, uid: string): Promise<number> {
    const internalUid = await world.identities.resolve(uid, SID)
    await world.assembly.onAuthenticated(uid, internalUid, SID)
    return internalUid
}

/** 监听进程就地执行：连接上下文由真实会话提供，且每条连接都不同。 */
async function executeLocally(world: World, uid: string, route: LobbyRpcType, payload: unknown): Promise<Outcome> {
    await authenticate(world, uid)
    world.connectionSeq += 1
    const context = {
        uid,
        sId: SID,
        sessionEpoch: `epoch-${uid}-${world.connectionSeq}`,
        connectionId: `fd-${uid}-${world.connectionSeq}`,
        ip: '127.0.0.1',
    }
    try {
        return { ok: true, res: lobbyOutcomeData(await world.assembly.routes.execute(route, context, payload)) }
    } catch (error) {
        return { ok: false, ...failureOf(error) }
    }
}

/** 进程间管道超时：本测试里目标 worker 就在同一个 Node 进程里，超时只是兜底。 */
const PIPE_TIMEOUT_MS = 5000

/**
 * 装一次**真实**的跨进程路由器（`installNativeLobbyProcessRouter`），源 worker = 0，目标 worker = 1。
 *
 * `RouteAction.processRouter` 是**进程级**钩子，而这里两个「进程」活在同一个 Node 进程里，
 * 所以「我是谁」只能在转发前后切换 `worker_id` 来模拟：目标 worker 执行时必须看到自己
 * 就是目标，否则会把同一次调用再转发一次（真实宿主上不会发生——两个进程各有一份运行时）。
 *
 * ⛔ 不要在测试里复刻一份路由逻辑。这条链路的缺陷形态正是「跨进程两侧各做一半」，
 * 复刻出来的假路由器会把缺陷一起复刻掉。
 */
function installProcessRouter(target: World, onForward?: (request: ProcessPipeRequest) => void): void {
    const runtime = {
        worker_id: 0 as number | null,
        taskworker: false,
        setting: { worker_num: 1, task_worker_num: 1 },
        requestMessage: async (message: unknown, targetWorkerId: number) => {
            assert.equal(targetWorkerId, 1, 'bindId 必须落到 task worker')
            onForward?.(message as ProcessPipeRequest)
            runtime.worker_id = 1
            try {
                // 目标 worker 用**自己的**装配执行，与真实多进程一致。
                return await handleProcessPipeRequest(target.deps, message as ProcessPipeRequest)
            } finally {
                runtime.worker_id = 0
            }
        },
    }
    installNativeLobbyProcessRouter(runtime as unknown as RuntimeServerLike, PIPE_TIMEOUT_MS)
}

/** 路由器是进程级单例：装、跑、还原，避免模式之间互相污染。 */
async function withProcessRouter<T>(
    target: World,
    run: () => Promise<T>,
    onForward?: (request: ProcessPipeRequest) => void,
): Promise<T> {
    const savedRouter = RouteAction.processRouter
    RouteAction.processRouter = undefined
    RouteAction.callGroups.clear()
    try {
        installProcessRouter(target, onForward)
        return await run()
    } finally {
        RouteAction.processRouter = savedRouter
        RouteAction.callGroups.clear()
    }
}

/**
 * 多进程：请求经进程边界转发，目标 worker 用自己的登记表执行。
 *
 * 走的是**整条链**——监听进程先过通用幂等闸，再由 `executeObjectAction` 里的
 * `RouteAction.processRouter` 转发。只驱动目标 worker 那一跳是测不到幂等闸的：
 * 那个模式看不到「闸被进了两次」，因为请求根本没经过监听进程的闸。
 */
async function executeForwarded(world: World, uid: string, route: LobbyRpcType, payload: unknown): Promise<Outcome> {
    const target = world.remote
    if (!target) throw new Error('forward 模式必须带目标 worker 装配')
    await authenticate(world, uid)
    world.connectionSeq += 1
    const context = {
        uid,
        sId: SID,
        sessionEpoch: `epoch-${uid}-${world.connectionSeq}`,
        connectionId: `fd-${uid}-${world.connectionSeq}`,
        ip: '127.0.0.1',
    }
    try {
        return await withProcessRouter(
            target,
            async () => ({
                ok: true as const,
                res: lobbyOutcomeData(await world.assembly.routes.execute(route, context, payload)),
            }),
            (request) => world.forwards.push(request),
        )
    } catch (error) {
        return { ok: false, ...failureOf(error) }
    }
}

function invoke(world: World, uid: string, route: LobbyRpcType, payload: unknown): Promise<Outcome> {
    return world.mode === 'single'
        ? executeLocally(world, uid, route, payload)
        : executeForwarded(world, uid, route, payload)
}

/** 只读观测：无论当前模式如何都走就地执行，让断言本身与模式无关。 */
async function observe(world: World, uid: string, route: LobbyRpcType, payload: unknown): Promise<any> {
    await authenticate(world, uid)
    world.connectionSeq += 1
    return lobbyOutcomeData(
        await world.assembly.routes.execute(
            route,
            {
                uid,
                sId: SID,
                sessionEpoch: `epoch-${uid}-${world.connectionSeq}`,
                connectionId: `fd-${uid}`,
                ip: '127.0.0.1',
            },
            payload,
        ),
    )
}

function failureOf(error: unknown): { code: string; msg: string } {
    const candidate = error as { code?: unknown; msg?: unknown; message?: unknown }
    return {
        code: typeof candidate?.code === 'string' ? candidate.code : 'INTERNAL',
        msg:
            typeof candidate?.msg === 'string'
                ? candidate.msg
                : typeof candidate?.message === 'string'
                  ? candidate.message
                  : String(error),
    }
}

const CASES: readonly ProtocolCase[] = [
    {
        name: 'user.getUserId',
        uid: PRIMARY_UID,
        route: 'user.getUserId',
        payload: {},
        expect: 'ok',
    },
    {
        name: 'user.getInfo on a fresh profile',
        uid: PRIMARY_UID,
        route: 'user.getInfo',
        payload: {},
        expect: 'ok',
    },
    {
        name: 'user.updateProfile writes the profile and advances ver',
        uid: PRIMARY_UID,
        route: 'user.updateProfile',
        payload: { clientReqId: 'mp-1', nickname: '阿斗', avatarId: 3 },
        expect: 'ok',
        verify: async (world) => {
            assert.deepEqual(await observe(world, PRIMARY_UID, 'user.getProfile', { uid: PRIMARY_UID }), {
                profile: {
                    uid: PRIMARY_UID,
                    nickname: '阿斗',
                    avatarId: 3,
                    province: '',
                    star: 0,
                    maxRound: 0,
                    wins: 0,
                    losses: 0,
                },
            })
            assert.equal((await observe(world, PRIMARY_UID, 'user.getInfo', {})).user.ver, 1)
        },
    },
    {
        name: 'user.updateProfile replay after a reconnect returns the first result without rewriting',
        uid: PRIMARY_UID,
        route: 'user.updateProfile',
        payload: { clientReqId: 'mp-1', nickname: '阿斗', avatarId: 3 },
        expect: 'ok',
        verify: async (world) => {
            // 幂等记录的键是 (uid, sId, route, clientReqId)：重连后 connectionId / sessionEpoch 变了，
            // 结论必须还是首次结果，ver 不得再推进。
            assert.equal((await observe(world, PRIMARY_UID, 'user.getInfo', {})).user.ver, 1)
        },
    },
    {
        name: 'user.updateProfile with the same clientReqId but another payload conflicts',
        uid: PRIMARY_UID,
        route: 'user.updateProfile',
        payload: { clientReqId: 'mp-1', nickname: '换个人' },
        expect: 'OPERATION_CONFLICT',
        verify: async (world) => {
            assert.equal(
                (await observe(world, PRIMARY_UID, 'user.getProfile', { uid: PRIMARY_UID })).profile.nickname,
                '阿斗',
            )
        },
    },
    {
        name: 'arena.capture takes an unowned tile',
        uid: PRIMARY_UID,
        route: 'arena.capture',
        payload: { clientReqId: 'mp-2', tile: 0 },
        expect: 'ok',
        verify: async (world) => {
            const board = await observe(world, PRIMARY_UID, 'arena.board', {})
            assert.deepEqual(board.tiles[0], { tile: 0, ownerUid: PRIMARY_UID, power: 1 })
            assert.equal(board.myTrophies, 1)
        },
    },
    {
        name: 'arena.capture replay does not reinforce twice',
        uid: PRIMARY_UID,
        route: 'arena.capture',
        payload: { clientReqId: 'mp-2', tile: 0 },
        expect: 'ok',
        verify: async (world) => {
            const board = await observe(world, PRIMARY_UID, 'arena.board', {})
            assert.equal(board.tiles[0].power, 1)
            assert.equal(board.myTrophies, 1)
        },
    },
    {
        name: 'arena.capture with the same clientReqId on another tile conflicts',
        uid: PRIMARY_UID,
        route: 'arena.capture',
        payload: { clientReqId: 'mp-2', tile: 5 },
        expect: 'OPERATION_CONFLICT',
    },
    {
        name: 'guild.join commits membership before waking members',
        uid: PRIMARY_UID,
        route: 'guild.join',
        payload: { clientReqId: 'mp-3', guildId: 1 },
        expect: 'ok',
        verify: async (world, pushes) => {
            assert.deepEqual(pushes, [
                { uid: PRIMARY_UID, sId: SID, type: 'guild.event', data: { seq: 1, guildId: 1 } },
            ])
            assert.deepEqual(await world.redis.sMembers(`nativeLobby:guild:members:v1:${SID}:1`), [PRIMARY_UID])
            assert.equal((await observe(world, PRIMARY_UID, 'user.getInfo', {})).user.guildId, 1)
        },
    },
    {
        name: 'guild.leave only wakes the remaining members',
        uid: PRIMARY_UID,
        route: 'guild.leave',
        payload: { clientReqId: 'mp-4' },
        expect: 'ok',
        verify: async (world, pushes) => {
            assert.deepEqual(pushes, [])
            assert.deepEqual(await world.redis.sMembers(`nativeLobby:guild:members:v1:${SID}:1`), [])
        },
    },
    {
        name: 'room.prepareCreate issues a creation ticket',
        uid: PRIMARY_UID,
        route: 'room.prepareCreate',
        payload: { clientReqId: 'mp-5', ...PRIVATE_ROOM_REQUEST },
        expect: 'ok',
        shape: ticketShape,
        verify: async (world) => {
            assert.equal(world.redis.zCard(roomTicketQuotaKey(SID, PRIMARY_UID)), 1)
        },
    },
    {
        name: 'room.prepareCreate replay does not issue a second ticket',
        uid: PRIMARY_UID,
        route: 'room.prepareCreate',
        payload: { clientReqId: 'mp-5', ...PRIVATE_ROOM_REQUEST },
        expect: 'ok',
        shape: ticketShape,
        verify: async (world) => {
            assert.equal(world.redis.zCard(roomTicketQuotaKey(SID, PRIMARY_UID)), 1)
        },
    },
    {
        name: 'room.prepareCreate takes a second slot',
        uid: PRIMARY_UID,
        route: 'room.prepareCreate',
        payload: { clientReqId: 'mp-6', ...PRIVATE_ROOM_REQUEST },
        expect: 'ok',
        shape: ticketShape,
        verify: async (world) => {
            assert.equal(world.redis.zCard(roomTicketQuotaKey(SID, PRIMARY_UID)), 2)
        },
    },
    {
        name: 'room.prepareCreate refuses to exceed the quota',
        uid: PRIMARY_UID,
        route: 'room.prepareCreate',
        payload: { clientReqId: 'mp-7', ...PRIVATE_ROOM_REQUEST },
        expect: 'ROOM_QUOTA_EXCEEDED',
        verify: async (world) => {
            assert.equal(world.redis.zCard(roomTicketQuotaKey(SID, PRIMARY_UID)), 2)
        },
    },
    {
        name: 'slg.tileCapture captures and publishes the tile',
        uid: PRIMARY_UID,
        route: 'slg.tileCapture',
        payload: { clientReqId: 'mp-8', tileId: 0 },
        expect: 'ok',
        verify: async (world) => {
            const map = await observe(world, PRIMARY_UID, 'slg.mapTiles', {
                mapId: 'senzhiguo',
                rect: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
            })
            assert.deepEqual(
                map.tiles.map((tile: { tileId: number }) => tile.tileId),
                [0],
            )
        },
    },
    {
        name: 'snakeCosmetic.getSnapshot returns the server catalog',
        uid: PRIMARY_UID,
        route: 'snakeCosmetic.getSnapshot',
        payload: {},
        expect: 'ok',
        shape: (res) => ({ profile: res.profile, catalogSize: res.catalog.length }),
    },
    {
        name: 'mail.list on an empty mailbox',
        uid: PRIMARY_UID,
        route: 'mail.list',
        payload: {},
        expect: 'ok',
    },
    {
        name: 'the same clientReqId for another user is a separate operation',
        uid: OTHER_UID,
        route: 'user.updateProfile',
        payload: { clientReqId: 'mp-1', nickname: '另一个人', avatarId: 9 },
        expect: 'ok',
        verify: async (world) => {
            // 共用 clientReqId 不得让两个用户互相顶替：幂等记录的键必须含 uid。
            assert.equal(
                (await observe(world, PRIMARY_UID, 'user.getProfile', { uid: PRIMARY_UID })).profile.nickname,
                '阿斗',
            )
            assert.equal(
                (await observe(world, OTHER_UID, 'user.getProfile', { uid: OTHER_UID })).profile.nickname,
                '另一个人',
            )
            assert.equal((await observe(world, OTHER_UID, 'user.getInfo', {})).user.ver, 1)
        },
    },
    {
        name: 'the same clientReqId for another user still conflicts on its own payload',
        uid: OTHER_UID,
        route: 'user.updateProfile',
        payload: { clientReqId: 'mp-1', nickname: '第三个人' },
        expect: 'OPERATION_CONFLICT',
        verify: async (world) => {
            assert.equal(
                (await observe(world, OTHER_UID, 'user.getProfile', { uid: OTHER_UID })).profile.nickname,
                '另一个人',
            )
        },
    },
]

/** 票据是随机值、到期时间是绝对时间：比较形状与语义，不比较字节。 */
function ticketShape(res: { creationTicket?: unknown; expiresAt?: unknown }): unknown {
    return {
        creationTicket: typeof res.creationTicket === 'string' && res.creationTicket.length >= 16,
        expiresAt: typeof res.expiresAt === 'number' && res.expiresAt > 0,
        fields: Object.keys(res).sort(),
    }
}

async function runCaseSet(mode: Mode): Promise<{ transcript: string[]; verified: number; forwards: number }> {
    const world = createWorld(mode)
    const transcript: string[] = []
    let verified = 0
    for (const entry of CASES) {
        const pushesBefore = world.pushes.length
        const outcome = await invoke(world, entry.uid, entry.route, entry.payload)
        const pushes = world.pushes.slice(pushesBefore)

        if (entry.expect === 'ok') {
            assert.equal(outcome.ok, true, `[${mode}] ${entry.name} 期望成功，实际 ${JSON.stringify(outcome)}`)
            const res = (outcome as { ok: true; res: unknown }).res
            transcript.push(`${entry.name} => ok:${JSON.stringify(entry.shape ? entry.shape(res) : res)}`)
        } else {
            assert.equal(outcome.ok, false, `[${mode}] ${entry.name} 期望 ${entry.expect}，实际成功`)
            assert.equal((outcome as { code: string }).code, entry.expect, `[${mode}] ${entry.name}`)
            transcript.push(`${entry.name} => err:${(outcome as { code: string }).code}`)
        }

        if (entry.verify) {
            await entry.verify(world, pushes)
            verified += 1
        }
    }
    transcript.push(`pushes => ${JSON.stringify(world.pushes)}`)
    return { transcript, verified, forwards: world.forwards.length }
}

describe('native Lobby single-process vs multi-process parity', () => {
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
                clientPort: 41101,
                internalPort: 41102,
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
        // 进程内没有 DifferCache 注入，提交阶段必须替身掉，否则会因 APP_TYPE 未初始化直接抛错。
        savedSave = RedisService.save
        RedisService.save = async () => undefined
        // 本文件验证的是「目标 worker 就地执行」，必须保证测试进程自身不会再往外转发。
        savedProcessRouter = RouteAction.processRouter
        RouteAction.processRouter = undefined
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

    it('reaches the same conclusion for every case through both execution paths', async () => {
        const single = await runCaseSet('single')
        const forward = await runCaseSet('forward')

        // 逐条比较：任何一条路由在转发路径下换了结论（响应、字符串错误码、推送目标）都会在这里失败。
        assert.deepEqual(forward.transcript, single.transcript)

        // 对等性不能靠空转取得：多进程那一路必须**真的**跨过进程边界，
        // 单进程那一路必须一次都没跨（否则比较的其实是同一条路径）。
        assert.ok(forward.forwards > 0, '多进程路径一次转发都没发生，对等性比较是空转的')
        assert.equal(single.forwards, 0, '单进程路径不得发生任何跨进程转发')

        // 防止「状态断言被静默跳过」：两侧都必须真的执行了每一条 verify。
        const expected = CASES.filter((entry) => entry.verify).length
        assert.ok(expected > 0)
        assert.equal(single.verified, expected)
        assert.equal(forward.verified, expected)
    })

    it('carries the trusted identity across the process boundary without fabricating session fields', async () => {
        const registry = new NativeLobbyRouteRegistry()
        const routes = new NativeLobbyProcessRoutes()
        routes.install(registry)
        const probe = 'user.__parityProbe' as LobbyRpcType
        const seen: Array<Record<string, unknown>> = []
        registry.register(probe, async (context) => {
            seen.push({
                uid: context.uid,
                sId: context.sId,
                sessionEpoch: context.sessionEpoch,
                connectionId: context.connectionId,
                ip: context.ip,
            })
            return { ok: true }
        })

        // 就地执行：真实会话字段齐全。
        await registry.execute(
            probe,
            { uid: PRIMARY_UID, sId: SID, sessionEpoch: 'epoch-live', connectionId: 'fd-42', ip: '10.0.0.9' },
            {},
        )
        // 转发执行：目标 worker 没有连接，也不知道 sessionEpoch。
        const forwarded = await handleProcessPipeRequest(
            {
                executeLobbyRoute: (route, identity, payload) => routes.execute(route, identity, payload),
                executeInternalAction: async () => undefined,
                lookupUserConnection: async () => null,
                pushLobbyConnection: async () => false,
                kickLobbyConnection: () => false,
            },
            {
                kind: 'routed-lobby-route',
                route: probe,
                payload: {},
                uid: PRIMARY_UID,
                internalUid: 1001,
                sid: SID,
                bindId: BIND_ID,
                traceId: 1,
                invokeLayer: 1,
            },
        )
        // 管道里带的是未解包的传输层结果：`kind` 让源进程把 `sync` 回放到本次调用上。
        assert.deepEqual(forwarded, { ok: true, res: { kind: 'lobby-route-outcome', data: { ok: true } } })

        assert.equal(seen.length, 2)
        // 可信身份必须一致——handler 的鉴权判据全部落在这两个字段上。
        assert.deepEqual(
            seen.map((entry) => ({ uid: entry.uid, sId: entry.sId })),
            [
                { uid: PRIMARY_UID, sId: SID },
                { uid: PRIMARY_UID, sId: SID },
            ],
        )
        assert.equal(seen[0]!.sessionEpoch, 'epoch-live')
        // 会话级字段留空而不是虚构：将来若有 handler 依赖它们，会 fail-closed，
        // 而不是拿到一个「看起来合法」的假值继续放行。
        assert.deepEqual(seen[1], { uid: PRIMARY_UID, sId: SID, sessionEpoch: '', connectionId: '', ip: '' })
    })

    /**
     * 「监听进程 → 目标 worker」**整条链**上，通用幂等闸只允许进一次。
     *
     * 这条用例存在的理由是一个真实缺陷：目标 worker 用同一份登记表执行时**又进了一次**通用闸，
     * 于是撞上监听进程刚写下的 `pending` 租约（记录键在中心 Redis 上跨进程共享），
     * 一次完全正常的 `guild.join` 被判成 `IN_PROGRESS`，副作用一次都没发生。
     *
     * `forward` 模式的对等用例看不到它——那个模式只驱动目标 worker 那一跳，
     * 请求根本没经过监听进程的闸。所以这里必须走**真实的生产路由器**，而不是在测试里复刻它。
     */
    it('enters the generic idempotency gate exactly once across the process hop', async () => {
        const redis = installFakeCenterRedis({ player: true })
        // 两个进程：装配彼此独立，但中心 Redis 共享——闸被进两次的观测面就在这里。
        // 出站记录各记一份，才能证明副作用落在**目标进程**那一个出口上。
        const listener = createWorldOn(redis, 'single')
        const target = buildWorld(redis, 'forward', [])
        const forwarded: ProcessPipeRequest[] = []

        await authenticate(listener, PRIMARY_UID)
        const context = {
            uid: PRIMARY_UID,
            sId: SID,
            sessionEpoch: 'epoch-hop',
            connectionId: 'fd-hop',
            ip: '127.0.0.1',
        }
        const payload = { clientReqId: 'hop-1', guildId: 1 }

        await withProcessRouter(
            target,
            async () => {
                const res = lobbyOutcomeData(
                    await listener.assembly.routes.execute('guild.join', context, payload),
                ) as {
                    ok: boolean
                    seq: number
                }
                assert.equal(res.ok, true, '跨进程的幂等写不得被判成 IN_PROGRESS')
                assert.equal(res.seq, 1)
                assert.equal(forwarded.length, 1, '请求必须真的跨了进程')
                // 副作用发生在目标进程：推送出口也必须是目标进程那一个。
                assert.deepEqual(target.pushes, [
                    { uid: PRIMARY_UID, sId: SID, type: 'guild.event', data: { seq: 1, guildId: 1 } },
                ])
                assert.deepEqual(listener.pushes, [], '监听进程不该自己产生领域推送')

                // 同 clientReqId 重放：必须由**监听进程**的闸短路，不得再跨一次进程、也不得再落一次副作用。
                const replay = lobbyOutcomeData(
                    await listener.assembly.routes.execute('guild.join', context, payload),
                ) as {
                    ok: boolean
                    seq: number
                }
                assert.equal(replay.seq, 1, '重放必须回同一结论')
                assert.equal(forwarded.length, 1, '重放不得再次跨进程')
                assert.equal(target.pushes.length, 1, '重放不得再次推送')
            },
            (request) => forwarded.push(request),
        )

        const events = (await observe(listener, PRIMARY_UID, 'guild.getEvents', { sinceSeq: 0 })) as {
            events: Array<{ kind: string; seq: number; data?: { uid?: string } }>
        }
        // 事件带写入时刻（绝对时间），只比较语义字段：恰好一条、同一 seq、同一个 uid。
        assert.equal(events.events.length, 1, '副作用必须恰好发生一次')
        assert.deepEqual(
            events.events.map((entry) => ({ kind: entry.kind, seq: entry.seq, uid: entry.data?.uid })),
            [{ kind: 'memberJoin', seq: 1, uid: PRIMARY_UID }],
        )
    })
})
