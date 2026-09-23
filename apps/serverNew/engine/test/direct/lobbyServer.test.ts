import assert from 'node:assert/strict'
import { AddressInfo } from 'node:net'
import { WebSocket } from 'ws'
import {
    LobbyAuthRejection,
    LobbyServer,
    type LobbyInboundFrame,
    type LobbyOutboundFrame,
    type LobbyWireCodec,
} from '../../src/net/lobby/LobbyServer'

const host = '127.0.0.1'

const codec: LobbyWireCodec = {
    maxMessageBytes: 1024,
    decodeClient(text): LobbyInboundFrame {
        const frame = JSON.parse(text) as LobbyInboundFrame
        if (!frame || typeof frame !== 'object' || !('kind' in frame)) throw new Error('bad frame')
        return frame
    },
    encodeServer(frame: LobbyOutboundFrame) {
        return JSON.stringify(frame)
    },
    validateRequest(type, payload) {
        if (type !== 'user.getInfo' || payload === undefined || Object.keys(payload as object).length !== 0) {
            throw new Error('bad request')
        }
        return payload
    },
    validateResponse(type, response) {
        if (type !== 'user.getInfo') throw new Error('bad response type')
        return response
    },
    validatePush(type, data) {
        return { type, data }
    },
}

function open(port: number): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(`ws://${host}:${port}`)
        socket.once('open', () => resolve(socket))
        socket.once('error', reject)
    })
}

/**
 * 每条 socket 一个按到达顺序排队的收件箱。
 *
 * ⛔ 不能用 `socket.once('message')`：服务端会背靠背发两条帧（封号是 `push` + `auth.error`），
 * 两条帧可能落在同一次 TCP 读里、在同一个 tick 内连续 emit；第二条到达时 `once` 监听器已被移除，
 * 帧会被直接丢掉，于是表现为随机 1/15 概率的 `message timeout`。
 */
interface Inbox {
    frames: any[]
    waiter?: { resolve: (value: any) => void; timer: ReturnType<typeof setTimeout> }
}

const inboxes = new WeakMap<WebSocket, Inbox>()

function inboxOf(socket: WebSocket): Inbox {
    const existing = inboxes.get(socket)
    if (existing) return existing
    const inbox: Inbox = { frames: [] }
    inboxes.set(socket, inbox)
    socket.on('message', (raw) => {
        const frame = JSON.parse(Buffer.from(raw as Buffer).toString('utf8'))
        const waiter = inbox.waiter
        if (!waiter) {
            inbox.frames.push(frame)
            return
        }
        inbox.waiter = undefined
        clearTimeout(waiter.timer)
        waiter.resolve(frame)
    })
    return inbox
}

function message(socket: WebSocket): Promise<any> {
    const inbox = inboxOf(socket)
    const buffered = inbox.frames.shift()
    if (buffered !== undefined) return Promise.resolve(buffered)
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            inbox.waiter = undefined
            reject(new Error('message timeout'))
        }, 1000)
        inbox.waiter = { resolve, timer }
    })
}

function close(socket: WebSocket): Promise<number> {
    return new Promise((resolve) => socket.once('close', (code) => resolve(code)))
}

/**
 * 轮询等待条件成立。
 *
 * ⛔ 不能用「等一个 `setTimeout(…, 0)`」代替：客户端观察到 close 只说明 TCP 连接已断，
 * 服务端自己的 `close` 回调可能还没跑完；赌一个 tick 会得到随机失败的 `0 !== 1`。
 */
async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5))
}

async function main() {
    const releases: string[] = []
    let holdNext = false
    let heldEntered: (() => void) | undefined
    let releaseHeld: (() => void) | undefined
    const server = new LobbyServer({
        host,
        port: 0,
        authTimeoutMs: 1000,
        handlerTimeoutMs: 1000,
        rateLimitCapacity: 20,
        rateLimitRefillPerSecond: 10,
        wire: codec,
        auth: {
            async authenticate(input) {
                if (input.token === 'banned-token') {
                    throw new LobbyAuthRejection({
                        code: 'ACCOUNT_BANNED',
                        msg: '账号已被封禁',
                        closeCode: 4901,
                        forceLogout: true,
                    })
                }
                if (input.token !== 'trusted-token') throw new Error('bad token')
                return { uid: 'user-9007199254740993', sId: input.sId, sessionEpoch: 'epoch-1' }
            },
            async validateActive(context) {
                return context.sessionEpoch === 'revoked' ? { code: 'AUTH_EPOCH_STALE', msg: 'revoked' } : null
            },
            async releaseOnline(context) {
                releases.push(context.connectionId)
            },
        },
        makeForceLogoutPush: (_error, closeCode) => ({
            type: 'auth.forceLogout',
            data: { reason: closeCode === 4901 ? 'banned' : 'revoked' },
        }),
        routes: {
            has(type) {
                return type === 'user.getInfo'
            },
            async execute(_type, context) {
                if (holdNext) {
                    holdNext = false
                    heldEntered?.()
                    await new Promise<void>((resolve) => {
                        releaseHeld = resolve
                    })
                }
                return { uid: context.uid }
            },
            assertComplete() {},
        },
    })
    await server.start()
    const port = (server as unknown as { httpServer: { address(): AddressInfo } }).httpServer.address().port
    try {
        const unauthorized = await open(port)
        unauthorized.send(JSON.stringify({ kind: 'rpc', rpc: { id: 'x', type: 'user.getInfo', payload: {} } }))
        assert.deepEqual(await message(unauthorized), {
            kind: 'control.error',
            err: { code: 'INVALID_FRAME', msg: '尚未完成认证' },
        })
        assert.equal(await close(unauthorized), 1008)

        // 封号是强制下线而非普通登录失败：关闭前先发 auth.forceLogout，并用 4901 关闭。
        const banned = await open(port)
        banned.send(JSON.stringify({ kind: 'auth', token: 'banned-token', sId: 7 }))
        assert.deepEqual(await message(banned), {
            kind: 'push',
            push: { type: 'auth.forceLogout', data: { reason: 'banned' } },
        })
        assert.deepEqual(await message(banned), {
            kind: 'auth.error',
            err: { code: 'ACCOUNT_BANNED', msg: '账号已被封禁' },
        })
        assert.equal(await close(banned), 4901)

        // 普通鉴权失败仍是 AUTH_REQUIRED + 1008，不能误报成强制下线。
        const rejected = await open(port)
        rejected.send(JSON.stringify({ kind: 'auth', token: 'wrong-token', sId: 7 }))
        assert.deepEqual(await message(rejected), {
            kind: 'auth.error',
            err: { code: 'AUTH_REQUIRED', msg: '认证失败' },
        })
        assert.equal(await close(rejected), 1008)

        const socket = await open(port)
        socket.send(JSON.stringify({ kind: 'auth', token: 'trusted-token', sId: 7 }))
        assert.deepEqual(await message(socket), { kind: 'auth.ok', uid: 'user-9007199254740993', sId: 7 })
        socket.send(JSON.stringify({ kind: 'rpc', rpc: { id: 'q1', type: 'user.getInfo', payload: {} } }))
        assert.deepEqual(await message(socket), {
            kind: 'reply',
            reply: { id: 'q1', ok: true, data: { uid: 'user-9007199254740993' } },
        })

        // 同一连接的接入队列只负责接纳：第一条业务尚未结束时，第二条应已进入 handler 并先回复。
        holdNext = true
        const entered = new Promise<void>((resolve) => {
            heldEntered = resolve
        })
        socket.send(JSON.stringify({ kind: 'rpc', rpc: { id: 'slow', type: 'user.getInfo', payload: {} } }))
        await entered
        socket.send(JSON.stringify({ kind: 'rpc', rpc: { id: 'fast', type: 'user.getInfo', payload: {} } }))
        assert.deepEqual(await message(socket), {
            kind: 'reply',
            reply: { id: 'fast', ok: true, data: { uid: 'user-9007199254740993' } },
        })
        releaseHeld?.()
        assert.deepEqual(await message(socket), {
            kind: 'reply',
            reply: { id: 'slow', ok: true, data: { uid: 'user-9007199254740993' } },
        })
        socket.send(JSON.stringify({ kind: 'rpc', rpc: { id: 'q2', type: 'missing.route', payload: {} } }))
        assert.deepEqual(await message(socket), {
            kind: 'reply',
            reply: { id: 'q2', ok: false, err: { code: 'UNKNOWN_TYPE', msg: '未知请求类型' } },
        })
        socket.send(JSON.stringify({ kind: 'rpc', rpc: { id: 'q3', type: 'user.getInfo', payload: { extra: true } } }))
        assert.deepEqual(await message(socket), {
            kind: 'reply',
            reply: { id: 'q3', ok: false, err: { code: 'INVALID_PAYLOAD', msg: '请求参数无效' } },
        })
        const closed = close(socket)
        socket.close()
        await closed
        // 先等到服务端确实完成释放，再断言「恰好一次」：既不能漏释放，也不能释放两次。
        await waitFor(() => releases.length >= 1)
        await new Promise((resolve) => setTimeout(resolve, 10))
        assert.equal(releases.length, 1, 'ready connection close must release authenticated ownership exactly once')
    } finally {
        await server.stop()
    }
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
