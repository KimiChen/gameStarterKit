import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import type { AddressInfo } from 'node:net'
import { WebSocket } from 'ws'
import { GameError, PlatformLineInfo, RedisService, RouteAction } from '@arthropoda/game-engine'
import { WebPlatformHttpContractMap } from '../../../generated/lobby-contract/protocol/http'
import {
    ForceLogoutReason,
    KICK_CLOSE_CODE,
    LOBBY_TRANSPORT_MAX_MESSAGE_BYTES,
    LOBBY_TRANSPORT_VERSION,
    ShopRpc,
    UserRpc,
    type LobbyTransportServerFrame,
} from '../../../generated/lobby-contract/protocol/lobbyRpc'
import { nativeLobbyProcessRoutes } from '../../../src/runtime/lobby/NativeLobbyProcessRoutes'
import { ShopNativeLobbyStore } from '../../../src/modules/shop/lobby/ShopNativeLobbyStore'
import { User } from '../../../src/modules/user/bean/User'
import { startConfiguredNativeLobby, type NativeLobbyRuntime } from '../../../src/startup/NativeLobbyRuntime'
import { installFakeCenterRedis, type FakeCenterRedis } from '../../support/FakeCenterRedis'

/**
 * 原生 Lobby 的真实 WebSocket 端到端闭环。
 *
 * 这里刻意走**生产装配路径**（`startConfiguredNativeLobby`），而不是在测试里自己拼一个 LobbyServer：
 * 真 `ws` 客户端 → 真 HTTP upgrade → `LobbyServer` → `NativeLobbyContractCodec`（shared 严格校验）→
 * `NativeLobbyAuthProvider`（回源 HTTP 验票 + 固定区服）→ 模块贡献的真实 handler
 * （`executeObjectAction` + 中心 Redis 假体 + 真 `WebPlatformSessionVerifier`）。
 *
 * 覆盖 P3 的验收面：认证 → ready → `user.getInfo` 拿到真实档案；非法 token / 错区 / 未知字段 /
 * 版本不匹配被稳定拒绝；关闭码与强制下线推送语义正确；原生入口默认关闭，不改动旧通道默认行为。
 */

const SID = 7
const EXTERNAL_UID = 'external-9007199254740993'
const OTHER_ZONE_UID = 'external-other-zone'
const AUTH_TIMEOUT_MS = 1200

type VerifyReason = 'NOT_FOUND' | 'MISMATCH' | 'BANNED' | 'DEREGISTERED' | 'EXPIRED'

interface FakeSession {
    readonly userId: string
    readonly issuedAtMs: number
    valid: boolean
    reason: VerifyReason
}

/** 平台会话的进程内假体；verify/register 的调用次数是「错区不得回源」的直接证据。 */
class FakeWebPlatform {
    readonly sessions = new Map<string, FakeSession>()
    verifyCalls = 0
    registerCalls = 0
    private server?: http.Server
    origin = ''

    async start(): Promise<void> {
        const server = http.createServer((request, response) => {
            void this.handle(request, response)
        })
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
        this.server = server
        this.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    }

    async stop(): Promise<void> {
        const server = this.server
        this.server = undefined
        if (!server) return
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }

    issue(token: string, serverId: number, userId: string, issuedAtMs = 1000): void {
        this.sessions.set(`${serverId}:${token}`, { userId, issuedAtMs, valid: true, reason: 'NOT_FOUND' })
    }

    invalidate(token: string, serverId: number, reason: VerifyReason): void {
        const key = `${serverId}:${token}`
        const session = this.sessions.get(key)
        if (session) session.valid = false
        else this.sessions.set(key, { userId: '', issuedAtMs: 0, valid: false, reason })
        const stored = this.sessions.get(key)!
        stored.reason = reason
    }

    private async handle(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
        const chunks: Buffer[] = []
        for await (const chunk of request) chunks.push(Buffer.from(chunk))
        const body = Buffer.concat(chunks).toString('utf8')
        const verify = WebPlatformHttpContractMap.VerifySession
        if (request.method === verify.method && request.url === verify.path) {
            this.verifyCalls += 1
            const payload = JSON.parse(body) as { accessToken: string; serverId: number }
            const session = this.sessions.get(`${payload.serverId}:${payload.accessToken}`)
            const answer =
                session?.valid === true
                    ? { valid: true, userId: session.userId, issuedAtMs: session.issuedAtMs }
                    : { valid: false, reason: session?.reason ?? 'NOT_FOUND' }
            return this.reply(response, answer)
        }
        const register = WebPlatformHttpContractMap.RegisterCharacter
        if (request.method === register.method && /^\/v1\/internal\/characters\/[^/]+\/\d+$/.test(request.url ?? '')) {
            this.registerCalls += 1
            return this.reply(response, { registered: true })
        }
        response.writeHead(404, { 'content-type': 'application/json' })
        response.end('{}')
    }

    private reply(response: http.ServerResponse, payload: unknown): void {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify(payload))
    }
}

/** 严格 FIFO 的帧队列：wire 上的顺序本身就是断言对象，不能用「按谓词找帧」的方式抹掉。 */
class LobbyClient {
    private readonly frames: LobbyTransportServerFrame[] = []
    private waiter?: { resolve: (frame: LobbyTransportServerFrame) => void }
    private closeResult?: { code: number; reason: string }
    private closeWaiter?: (value: { code: number; reason: string }) => void

    private constructor(readonly socket: WebSocket) {
        socket.on('message', (raw, isBinary) => {
            assert.equal(isBinary, false, '原生 Lobby 只应发出文本帧')
            const frame = JSON.parse(String(raw)) as LobbyTransportServerFrame
            if (this.waiter) {
                const pending = this.waiter
                this.waiter = undefined
                pending.resolve(frame)
            } else {
                this.frames.push(frame)
            }
        })
        socket.on('close', (code, reason) => {
            this.closeResult = { code, reason: reason.toString() }
            this.closeWaiter?.(this.closeResult)
            this.closeWaiter = undefined
        })
        socket.on('error', () => undefined)
    }

    static async connect(port: number): Promise<LobbyClient> {
        const socket = new WebSocket(`ws://127.0.0.1:${port}`)
        await new Promise<void>((resolve, reject) => {
            socket.once('open', resolve)
            socket.once('error', reject)
        })
        return new LobbyClient(socket)
    }

    send(frame: unknown): void {
        this.socket.send(JSON.stringify(frame))
    }

    sendBinary(payload: Buffer): void {
        this.socket.send(payload)
    }

    /** 发一条不经 JSON 封装的原始文本（用于验证「非法帧」而不是「非法字段」）。 */
    sendText(text: string): void {
        this.socket.send(text)
    }

    next(timeoutMs = 3000): Promise<LobbyTransportServerFrame> {
        const buffered = this.frames.shift()
        if (buffered) return Promise.resolve(buffered)
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.waiter = undefined
                reject(new Error('等待 Lobby 帧超时'))
            }, timeoutMs)
            this.waiter = {
                resolve: (frame) => {
                    clearTimeout(timer)
                    resolve(frame)
                },
            }
        })
    }

    waitClose(timeoutMs = 3000): Promise<{ code: number; reason: string }> {
        if (this.closeResult) return Promise.resolve(this.closeResult)
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.closeWaiter = undefined
                reject(new Error('等待连接关闭超时'))
            }, timeoutMs)
            this.closeWaiter = (value) => {
                clearTimeout(timer)
                resolve(value)
            }
        })
    }

    close(): void {
        this.socket.close()
    }
}

describe('native Lobby end-to-end over a real WebSocket', () => {
    let platform: FakeWebPlatform
    let runtime: NativeLobbyRuntime | undefined
    let redis: FakeCenterRedis
    let port = 0
    let clients: LobbyClient[] = []
    const envNames = [
        'NATIVE_LOBBY_HOST',
        'NATIVE_LOBBY_PORT',
        'WEBPLATFORM_INTERNAL_ORIGIN',
        'WEBPLATFORM_SERVICE_ID',
        'WEBPLATFORM_SERVICE_SECRET',
    ] as const
    let savedEnv: Record<string, string | undefined> = {}
    let savedGlobals: Record<string, unknown> = {}
    let savedSave: typeof RedisService.save
    let savedProcessRouter: typeof RouteAction.processRouter
    let savedPlatformIdMap: Record<string, number>
    let savedUserLoadOnlyRead: unknown

    before(async () => {
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
        // 原生入口读的是平台配置里的端口/超时，不是 shared 的默认常量。
        ;(globalThis as Record<string, unknown>).CP = {
            platform: { gmSecret: 'gm-secret' },
            service: {
                sid: SID,
                clientHost: '127.0.0.1',
                clientPort: 41001,
                internalPort: 41002,
                authTimeoutMs: AUTH_TIMEOUT_MS,
                heartbeatTimeoutMs: 5000,
                maxPacketSize: 64 * 1024,
            },
        }
        // 内部 uid 分配要读平台基数；测试里只注册本平台，避免依赖真实平台配置。
        savedPlatformIdMap = PlatformLineInfo.platformIdMap
        PlatformLineInfo.register({ bearjoy: 1 })
        GameError.logicError = new GameError(500, 'logic')
        GameError.runtimeError = new GameError(501, 'runtime')
        GameError.apiCallQueueTimeout = new GameError(502, 'queue timeout')
        savedSave = RedisService.save
        RedisService.save = async () => undefined
        savedProcessRouter = RouteAction.processRouter
        RouteAction.processRouter = undefined
        const userBean = User as unknown as { loadOnlyRead: unknown }
        savedUserLoadOnlyRead = userBean.loadOnlyRead
        userBean.loadOnlyRead = async () => undefined
        redis = installFakeCenterRedis({ player: true })

        platform = new FakeWebPlatform()
        await platform.start()
        port = await freePort()

        savedEnv = {}
        for (const name of envNames) savedEnv[name] = process.env[name]
        process.env.NATIVE_LOBBY_HOST = '127.0.0.1'
        process.env.NATIVE_LOBBY_PORT = String(port)
        process.env.WEBPLATFORM_INTERNAL_ORIGIN = platform.origin
        process.env.WEBPLATFORM_SERVICE_ID = 'game-test'
        process.env.WEBPLATFORM_SERVICE_SECRET = 'test-secret'

        runtime = await startConfiguredNativeLobby()
        assert.ok(runtime, '原生 Lobby 在配置齐全时必须真的启动')
    })

    after(async () => {
        for (const client of clients) client.close()
        clients = []
        await runtime?.stop()
        nativeLobbyProcessRoutes.reset()
        for (const name of envNames) {
            const value = savedEnv[name]
            if (value === undefined) delete process.env[name]
            else process.env[name] = value
        }
        RedisService.save = savedSave
        RouteAction.processRouter = savedProcessRouter
        ;(User as unknown as { loadOnlyRead: unknown }).loadOnlyRead = savedUserLoadOnlyRead
        RouteAction.callGroups.clear()
        PlatformLineInfo.register(savedPlatformIdMap)
        for (const [name, value] of Object.entries(savedGlobals)) {
            if (value === undefined) delete (globalThis as Record<string, unknown>)[name]
            else (globalThis as Record<string, unknown>)[name] = value
        }
        await platform.stop()
    })

    afterEach(() => {
        for (const client of clients) client.close()
        clients = []
    })

    async function connect(): Promise<LobbyClient> {
        const client = await LobbyClient.connect(port)
        clients.push(client)
        return client
    }

    async function connectReady(token: string, sId = SID, uid = EXTERNAL_UID, reconnect = false): Promise<LobbyClient> {
        platform.issue(token, sId, uid)
        const client = await connect()
        client.send(authFrame(token, sId, reconnect))
        const frame = await client.next()
        assert.equal(frame.kind, 'auth.ok')
        assert.deepEqual(frame, { v: LOBBY_TRANSPORT_VERSION, kind: 'auth.ok', uid, sId })
        return client
    }

    /** 读公开档案视图的 nickname：走真实 wire，不直接摸存储。 */
    async function nicknameOf(client: LobbyClient): Promise<string> {
        client.send(rpc('qn', UserRpc.GetProfile, { uid: EXTERNAL_UID }))
        const frame = await client.next()
        assert.equal(frame.kind, 'reply')
        return (frame as { reply: { ok: true; data: { profile: { nickname: string } } } }).reply.data.profile.nickname
    }

    /** 自档 `ver`：重连后不得被重置。 */
    async function profileVersionOf(client: LobbyClient): Promise<number> {
        client.send(rpc('qv', UserRpc.GetInfo))
        const frame = await client.next()
        assert.equal(frame.kind, 'reply')
        return (frame as { reply: { ok: true; data: { user: { ver: number } } } }).reply.data.user.ver
    }

    /** 道具账本的**物理**读取：断言落在存储上，而不是复用生产读函数。 */
    async function itemCountOf(uid: string, itemId: number): Promise<number> {
        return Number((await redis.hGet('nativeLobby:grants:items:v1', `${SID}:${uid}:${itemId}`)) ?? 0)
    }

    async function balanceOf(uid: string): Promise<number> {
        return Number((await redis.hGet('nativeLobby:shop:balance:v1', `${SID}:${uid}`)) ?? 0)
    }

    /** 轮询等待条件成立；用于「服务端异步结算完 pending RPC」这类没有回调可挂的观察点。 */
    async function waitFor(check: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
        const deadline = Date.now() + timeoutMs
        for (;;) {
            if (await check()) return
            if (Date.now() > deadline) throw new Error('等待条件成立超时')
            await new Promise((resolve) => setTimeout(resolve, 10))
        }
    }

    /** 与客户端一致：空请求体也要发 `payload: {}`，shared 的 `emptyPayload` 不接受缺省 payload。 */
    function rpc(id: string, type: string, payload: unknown = {}) {
        return { v: LOBBY_TRANSPORT_VERSION, kind: 'rpc', rpc: { id, type, payload } }
    }

    it('authenticates over a real socket and returns a real user profile', async () => {
        const client = await connectReady('token-alpha')
        // 认证建档必须先登记外部角色，再由本服建默认档。
        assert.equal(platform.registerCalls, 1)

        client.send(rpc('r1', UserRpc.GetUserId))
        const userId = await client.next()
        assert.equal(userId.kind, 'reply')
        assert.equal(
            userId.kind === 'reply' && userId.reply.ok,
            true,
            `期望成功的 user.getUserId 响应，实际=${JSON.stringify(userId)}`,
        )
        // 契约里的 uid 就是可信外部身份（服务端从 token 反查），不是内部数值 ID。
        assert.deepEqual(userId, {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'reply',
            reply: { id: 'r1', ok: true, data: { uid: EXTERNAL_UID } },
        })
        // 内部 uid 由中心 Redis 原子分配，绝不是 Number(外部 uid) 或任何字符串转换。
        const internalUid = Number(await redis.hGet('nativeLobby:identity:v1', `${SID}:${EXTERNAL_UID}`))
        assert.ok(Number.isSafeInteger(internalUid) && internalUid > 0, `内部 uid 必须是正整数，实际=${internalUid}`)
        assert.notEqual(String(internalUid), EXTERNAL_UID)

        client.send(rpc('r2', UserRpc.GetInfo))
        const info = await client.next()
        assert.equal(info.kind, 'reply')
        assert.deepEqual(info, {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'reply',
            reply: {
                id: 'r2',
                ok: true,
                data: {
                    user: {
                        uid: EXTERNAL_UID,
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
                    },
                },
            },
        })

        // 读他档走公开视图；未建档的 uid 返回 null 而不是半状态。
        client.send(rpc('r3', UserRpc.GetProfile, { uid: EXTERNAL_UID }))
        const profile = await client.next()
        assert.deepEqual(profile, {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'reply',
            reply: {
                id: 'r3',
                ok: true,
                data: {
                    profile: {
                        uid: EXTERNAL_UID,
                        nickname: '',
                        avatarId: -1,
                        province: '',
                        star: 0,
                        maxRound: 0,
                        wins: 0,
                        losses: 0,
                    },
                },
            },
        })

        // 心跳在 ready 后仍可用，且不会被打成业务请求。
        client.send({ v: LOBBY_TRANSPORT_VERSION, kind: 'ping', nonce: 'n1' })
        assert.deepEqual(await client.next(), { v: LOBBY_TRANSPORT_VERSION, kind: 'pong', nonce: 'n1' })
    })

    it('rejects another zone before ever asking the identity service', async () => {
        const before = platform.verifyCalls
        platform.issue('token-zone9', 9, OTHER_ZONE_UID)
        const client = await connect()
        client.send(authFrame('token-zone9', 9))
        assert.deepEqual(await client.next(), {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'auth.error',
            err: { code: 'AUTH_REQUIRED', msg: '区服不匹配' },
        })
        // 回源会拿到「合法」结果，于是把 zone 9 的角色建到 zone 7 进程上——所以必须回源前拒绝。
        assert.equal(platform.verifyCalls, before)
        assert.deepEqual(await client.waitClose(), { code: 1008, reason: '区服不匹配' })
    })

    it('rejects invalid tokens and bans with the frozen kick close codes', async () => {
        platform.invalidate('token-expired', SID, 'EXPIRED')
        const expired = await connect()
        expired.send(authFrame('token-expired', SID))
        assert.deepEqual(await expired.next(), {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'auth.error',
            err: { code: 'AUTH_REQUIRED', msg: '认证失败' },
        })
        assert.equal((await expired.waitClose()).code, 1008)

        platform.invalidate('token-banned', SID, 'BANNED')
        const banned = await connect()
        banned.send(authFrame('token-banned', SID))
        // 封号不是普通登录失败：推送原因与关闭码必须同源（4901），否则客户端只会看到「掉线」。
        assert.deepEqual(await banned.next(), {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'push',
            push: { type: 'auth.forceLogout', data: { reason: ForceLogoutReason.Banned } },
        })
        assert.deepEqual(await banned.next(), {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'auth.error',
            err: { code: 'ACCOUNT_BANNED', msg: '账号已被封禁' },
        })
        assert.equal((await banned.waitClose()).code, KICK_CLOSE_CODE[ForceLogoutReason.Banned])
    })

    it('fails closed on an unsupported transport version, a malformed frame and a binary frame', async () => {
        const versioned = await connect()
        versioned.send({ v: 99, kind: 'auth', token: 'token-alpha', sId: SID })
        assert.deepEqual(await versioned.next(), {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'control.error',
            err: { code: 'INVALID_FRAME', msg: '非法协议帧' },
        })
        assert.deepEqual(await versioned.waitClose(), { code: 1007, reason: '非法协议帧' })

        const malformed = await connect()
        malformed.sendText('{not json')
        assert.equal((await malformed.next()).kind, 'control.error')
        assert.equal((await malformed.waitClose()).code, 1007)

        const binary = await connect()
        binary.sendBinary(Buffer.from([0x08, 0x01]))
        assert.deepEqual(await binary.next(), {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'control.error',
            err: { code: 'BINARY_FRAME_UNSUPPORTED', msg: 'Lobby 仅接受文本帧' },
        })
        assert.equal((await binary.waitClose()).code, 1003)
    })

    it('refuses an oversized frame and keeps serving other connections', async () => {
        // 大包必须 fail-closed：`ws` 的 `maxPayload` 与 `LobbyServer` 的字节上限同源于
        // `LOBBY_TRANSPORT_MAX_MESSAGE_BYTES`（64 KiB），超限帧不得进入业务 handler。
        const client = await connectReady('token-oversize')
        const pad = 'x'.repeat(LOBBY_TRANSPORT_MAX_MESSAGE_BYTES)
        const oversize = `{"v":${LOBBY_TRANSPORT_VERSION},"kind":"rpc","id":"big","type":"user.getInfo","payload":{"pad":"${pad}"}}`
        assert.ok(
            Buffer.byteLength(oversize, 'utf8') > LOBBY_TRANSPORT_MAX_MESSAGE_BYTES,
            '构造的帧必须真的超过上限，否则这条用例什么都没证明',
        )
        client.sendText(oversize)
        const closed = await client.waitClose()
        assert.equal(closed.code, 1009, `超限帧必须以「消息过大」关闭，实际=${JSON.stringify(closed)}`)

        // 服务端不得因大包崩掉或降级：另一条连接仍能完成认证与查询。
        const other = await connectReady('token-oversize-2')
        other.send(rpc('ok', UserRpc.GetUserId))
        const reply = await other.next()
        assert.equal(reply.kind, 'reply')
    })

    it('rejects an rpc before authentication, an unknown route and extra payload fields', async () => {
        const early = await connect()
        early.send(rpc('early', UserRpc.GetInfo))
        assert.deepEqual(await early.next(), {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'control.error',
            err: { code: 'INVALID_FRAME', msg: '尚未完成认证' },
        })
        assert.equal((await early.waitClose()).code, 1008)

        const client = await connectReady('token-gamma')
        client.send(rpc('u1', 'user.notARoute'))
        assert.deepEqual(await client.next(), {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'reply',
            reply: { id: 'u1', ok: false, err: { code: 'UNKNOWN_TYPE', msg: '未知请求类型' } },
        })

        // 未知字段必须被拒绝而不是静默剥离：剥离会让「客户端以为生效了」变成静默丢数据。
        client.send(rpc('p1', UserRpc.GetInfo, { forged: true }))
        assert.deepEqual(await client.next(), {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'reply',
            reply: { id: 'p1', ok: false, err: { code: 'INVALID_PAYLOAD', msg: '请求参数无效' } },
        })

        // 同一连接重复认证不能拿到第二个身份。
        client.send(authFrame('token-gamma', SID))
        assert.deepEqual(await client.next(), {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'control.error',
            err: { code: 'AUTH_ALREADY_COMPLETED', msg: '连接已完成认证' },
        })
    })

    it('rechecks the session on every rpc instead of trusting the connection', async () => {
        const client = await connectReady('token-delta')
        client.send(rpc('k1', UserRpc.GetUserId))
        assert.equal((await client.next()).kind, 'reply')

        platform.invalidate('token-delta', SID, 'EXPIRED')
        client.send(rpc('k2', UserRpc.GetUserId))
        assert.deepEqual(await client.next(), {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'reply',
            reply: { id: 'k2', ok: false, err: { code: 'AUTH_REQUIRED', msg: '会话已失效' } },
        })
        // 旧连接不得因为「已经 ready 过」而继续执行后续业务。
        client.send(rpc('k3', UserRpc.GetUserId))
        assert.deepEqual(await client.next(), {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'reply',
            reply: { id: 'k3', ok: false, err: { code: 'AUTH_REQUIRED', msg: '会话已失效' } },
        })
    })

    it('closes an unauthenticated connection after the auth timeout', async () => {
        const client = await connect()
        assert.deepEqual(await client.next(AUTH_TIMEOUT_MS + 2000), {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'control.error',
            err: { code: 'AUTH_TIMEOUT', msg: '认证超时' },
        })
        assert.equal((await client.waitClose()).code, 1008)
    })

    it('kicks the previous connection with 4902 on a second login and 4903 on an operator revoke', async () => {
        const first = await connectReady('token-epsilon')
        const second = await connectReady('token-epsilon')

        // 顶号：新连接先就位，再踢旧连接，旧连接的迟到清理不能抹掉新会话。
        assert.deepEqual(await first.next(), {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'push',
            push: { type: 'auth.forceLogout', data: { reason: ForceLogoutReason.Replaced } },
        })
        assert.equal((await first.waitClose()).code, KICK_CLOSE_CODE[ForceLogoutReason.Replaced])
        second.send(rpc('s1', UserRpc.GetUserId))
        assert.equal((await second.next()).kind, 'reply')

        // 运营强制下线：只有监听进程的运行时能按 uid/sId 找到连接并踢掉。
        assert.equal(runtime!.revoke(EXTERNAL_UID, SID), true)
        assert.deepEqual(await second.next(), {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'push',
            push: { type: 'auth.forceLogout', data: { reason: ForceLogoutReason.Revoked } },
        })
        assert.equal((await second.waitClose()).code, KICK_CLOSE_CODE[ForceLogoutReason.Revoked])
        assert.equal(runtime!.revoke(EXTERNAL_UID, SID), false)
    })

    it('re-verifies the identity on reconnect and restores the character snapshot', async () => {
        const first = await connectReady('token-reconnect')
        first.send(rpc('w1', UserRpc.UpdateProfile, { clientReqId: 'rc-1', nickname: '重连前', avatarId: 3 }))
        assert.equal((await first.next()).kind, 'reply')
        assert.equal(await nicknameOf(first), '重连前')
        assert.equal(await profileVersionOf(first), 1)
        first.close()
        await first.waitClose()

        // `reconnect` 只表示客户端「正在恢复连接」；服务端仍须完整复验 token/uid/区服，
        // ⛔ 不得因为带了该标志就跳过回源或信任连接。
        const verifyCallsBefore = platform.verifyCalls
        const second = await connectReady('token-reconnect', SID, EXTERNAL_UID, true)
        assert.equal(platform.verifyCalls, verifyCallsBefore + 1, '重连不得跳过回源复验')
        // 角色快照恢复：重连后档案仍在，`ver` 不得被重置成 0（重置等于把角色清零）。
        assert.equal(await nicknameOf(second), '重连前')
        assert.equal(await profileVersionOf(second), 1)
    })

    it('applies the same zone and token checks to a reconnect frame', async () => {
        // 带 `reconnect: true` 的错区票据同样必须在回源之前被拒：标志不能换来一条捷径。
        const before = platform.verifyCalls
        platform.issue('token-zone9-reconnect', 9, OTHER_ZONE_UID)
        const wrongZone = await connect()
        wrongZone.send(authFrame('token-zone9-reconnect', 9, true))
        assert.deepEqual(await wrongZone.next(), {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'auth.error',
            err: { code: 'AUTH_REQUIRED', msg: '区服不匹配' },
        })
        assert.equal(platform.verifyCalls, before, '重连的错区票据也必须回源前拒绝')

        // 无效 token 的 reconnect 帧也不能凭标志过关。
        const badToken = await connect()
        badToken.send(authFrame('token-does-not-exist', SID, true))
        assert.deepEqual(await badToken.next(), {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'auth.error',
            err: { code: 'AUTH_REQUIRED', msg: '认证失败' },
        })
        assert.equal((await badToken.waitClose()).code, 1008)
    })

    it('settles a pending write after a disconnect and never re-applies it on retry', async () => {
        const uid = EXTERNAL_UID
        await new ShopNativeLobbyStore().credit(uid, SID, 100)
        const client = await connectReady('token-pending')

        // 注入延迟把 handler 停在「已扣款、发放前」的窗口里，从而保证断线确实发生在 RPC 飞行中。
        const originalHSet = redis.hSet.bind(redis)
        const operationsKey = 'nativeLobby:shop:operations:v1'
        let inFlight = false
        redis.hSet = async (key: string, field: string, value: string) => {
            if (!inFlight && key === operationsKey) {
                inFlight = true
                await new Promise((resolve) => setTimeout(resolve, 200))
            }
            return originalHSet(key, field, value)
        }
        try {
            client.send(rpc('p1', ShopRpc.Purchase, { clientReqId: 'pend-1', sku: 'shop.frag29x10' }))
            await new Promise((resolve) => setTimeout(resolve, 60))
            assert.equal(inFlight, true, '断线必须发生在请求仍在飞行时，否则这条用例没在测断线')
            client.close()
            // 断线这一刻发放尚未落地：这条断言把「确实是飞行中断线」钉死（去掉注入延迟就会失败）。
            assert.equal(await itemCountOf(uid, 29), 0)
            await client.waitClose()
        } finally {
            redis.hSet = originalHSet
        }
        // 断线后 pending RPC 仍要结算：业务写入必须落地，不能因为客户端走了就被取消。
        await waitFor(async () => (await itemCountOf(uid, 29)) === 10)
        assert.equal(await balanceOf(uid), 0)

        // 服务端**不**自动重放写请求；客户端按契约用同一 clientReqId 重试即可拿到一致结论。
        const retry = await connectReady('token-pending')
        retry.send(rpc('p2', ShopRpc.Purchase, { clientReqId: 'pend-1', sku: 'shop.frag29x10' }))
        const reply = await retry.next()
        assert.equal(reply.kind, 'reply')
        assert.equal(reply.kind === 'reply' && reply.reply.ok, true, JSON.stringify(reply))
        // 只扣一次、只发一次。
        assert.equal(await itemCountOf(uid, 29), 10)
        assert.equal(await balanceOf(uid), 0)
    })

    it('never lets a stale connection teardown clobber the newer session', async () => {
        const first = await connectReady('token-generation')
        // 同一 token 的第二个连接先就位，再踢旧连接——旧连接的迟到清理必然发生在新会话之后。
        const second = await connectReady('token-generation')
        assert.equal((await first.waitClose()).code, KICK_CLOSE_CODE[ForceLogoutReason.Replaced])
        // 等旧连接的 close 回调跑完：它只允许清掉属于自己的那一代，不得动新会话。
        await new Promise((resolve) => setTimeout(resolve, 100))

        assert.equal(await runtime!.push(EXTERNAL_UID, SID, 'server.notice', { text: '还在线' }), true)
        assert.deepEqual(await second.next(), {
            v: LOBBY_TRANSPORT_VERSION,
            kind: 'push',
            push: { type: 'server.notice', data: { text: '还在线' } },
        })
        second.send(rpc('g1', UserRpc.GetUserId))
        assert.equal((await second.next()).kind, 'reply')
        // 在线表仍指向新连接：运营踢人必须命中它，而不是「查不到在线连接」。
        assert.equal(runtime!.revoke(EXTERNAL_UID, SID), true)
        assert.equal((await second.waitClose()).code, KICK_CLOSE_CODE[ForceLogoutReason.Revoked])
    })

    it('rate limits a burst of rpc frames without dropping the connection', async () => {
        const client = await connectReady('token-zeta')
        const total = 40
        for (let index = 0; index < total; index += 1) client.send(rpc(`b${index}`, UserRpc.GetUserId))
        const replies: string[] = []
        for (let index = 0; index < total; index += 1) {
            const frame = await client.next()
            assert.equal(frame.kind, 'reply')
            replies.push(frame.kind === 'reply' && frame.reply.ok ? 'ok' : 'limited')
        }
        // 桶容量 20、速率 10/s：一次突发必然打出 RATE_LIMITED，但连接必须留着。
        assert.ok(replies.includes('limited'), `期望出现限流响应，实际=${JSON.stringify(replies)}`)
        assert.ok(replies[0] === 'ok', '首个请求不应被限流')
    })

    it('never lets a default configuration open the native entry', async () => {
        // 原生入口只由显式环境开启；没有配置时启动函数返回 undefined，旧通道默认行为不变。
        const names = [...envNames]
        const saved: Record<string, string | undefined> = {}
        for (const name of names) {
            saved[name] = process.env[name]
            delete process.env[name]
        }
        try {
            assert.equal(await startConfiguredNativeLobby(), undefined)
        } finally {
            for (const name of names) process.env[name] = saved[name]!
        }
    })
})

/** `reconnect: true` 只表示客户端在恢复连接；服务端仍须完整复验，测试据此验证「不是绕过」。 */
function authFrame(token: string, sId: number, reconnect = false) {
    return reconnect
        ? { v: LOBBY_TRANSPORT_VERSION, kind: 'auth', token, sId, reconnect: true }
        : { v: LOBBY_TRANSPORT_VERSION, kind: 'auth', token, sId }
}

/** 先占用一个空闲端口再释放，供 LobbyServer 绑定；测试进程内不存在端口竞争。 */
async function freePort(): Promise<number> {
    const probe = net.createServer()
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
    const port = (probe.address() as AddressInfo).port
    await new Promise<void>((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())))
    return port
}
