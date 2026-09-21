import http from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { isLobbyRouteOutcome, lobbyRouteOutcome } from './LobbyRouteOutcome'

/**
 * 无状态 Lobby wire 的引擎接缝。
 *
 * engine 只认识字符串路由和对象，不导入业务 shared 契约、更不认识数字协议号或
 * Protobuf。server 在装配时提供严格 wire codec、鉴权和业务 handler。
 */
export interface LobbyAuthInput {
    readonly token: string
    readonly sId: number
    readonly ip: string
    readonly reconnect: boolean
}

/** uid 保持 string，禁止用 Number(uid) 作为跨系统身份关联。 */
export interface LobbyIdentity {
    readonly uid: string
    readonly sId: number
    /** 由身份服务返回的会话/撤销纪元；每条业务消息复验。 */
    readonly sessionEpoch: string
    /**
     * 实现方解析出的内部角色 ID。engine 不解释它，只随连接上下文透传：
     * 断线收尾（`LobbyAuthProvider.releaseOnline`）需要它才能定位业务角色。
     */
    readonly internalUid?: number
}

export interface LobbyConnectionContext extends LobbyIdentity {
    readonly connectionId: string
    readonly ip: string
}

export interface LobbyAuthProvider {
    authenticate(input: LobbyAuthInput): Promise<LobbyIdentity>
    /** 返回 null 代表本消息仍有效；不要缓存鉴权结论跳过该调用。 */
    validateActive(context: LobbyConnectionContext): Promise<LobbyWireBusinessError | null>
    /** 新连接已通过全部鉴权；实现方可原子替换同 uid/sId 的在线归属并踢旧连接。 */
    claimOnline?(context: LobbyConnectionContext): Promise<void>
    releaseOnline?(context: LobbyConnectionContext): Promise<void>
}

export interface LobbyWireBusinessError {
    readonly code: string
    readonly msg: string
}

/**
 * 鉴权拒绝的结构化结果。engine 不认识业务错误码，只透传 `code` 与关闭码；
 * `forceLogout` 为真时表示这不是「普通登录失败」，需要在关闭前发一条强制下线推送。
 */
export interface LobbyAuthRejectionInit {
    readonly code: string
    readonly msg: string
    /** 关闭码必须避开 Colyseus 保留段；缺省 1008 表示普通鉴权失败。 */
    readonly closeCode?: number
    readonly forceLogout?: boolean
}

export class LobbyAuthRejection extends Error {
    readonly code: string
    readonly msg: string
    readonly closeCode: number
    readonly forceLogout: boolean

    constructor(init: LobbyAuthRejectionInit) {
        super(init.msg)
        this.name = 'LobbyAuthRejection'
        this.code = init.code
        this.msg = init.msg
        this.closeCode = init.closeCode ?? 1008
        this.forceLogout = init.forceLogout === true
    }
}

export interface LobbyInboundAuth {
    readonly kind: 'auth'
    readonly token: string
    readonly sId: number
    readonly reconnect?: true
}

export interface LobbyInboundRpc {
    readonly kind: 'rpc'
    readonly rpc: { readonly id: string; readonly type: string; readonly payload?: unknown }
}

export interface LobbyInboundHeartbeat {
    readonly kind: 'ping' | 'pong'
    readonly nonce: string
}

export type LobbyInboundFrame = LobbyInboundAuth | LobbyInboundRpc | LobbyInboundHeartbeat

export type LobbyOutboundFrame =
    | { readonly kind: 'auth.ok'; readonly uid: string; readonly sId: number }
    | { readonly kind: 'auth.error'; readonly err: LobbyWireBusinessError }
    | {
          readonly kind: 'reply'
          readonly reply:
              | { readonly id: string; readonly ok: true; readonly data?: unknown; readonly sync?: unknown }
              | { readonly id: string; readonly ok: false; readonly err: LobbyWireBusinessError }
      }
    | { readonly kind: 'sync'; readonly sync: unknown }
    | { readonly kind: 'push'; readonly push: { readonly type: string; readonly data: unknown } }
    | { readonly kind: 'ping' | 'pong'; readonly nonce: string }
    | { readonly kind: 'control.error'; readonly err: { readonly code: string; readonly msg: string } }
    | { readonly kind: 'close'; readonly code: number; readonly reason: string }

export interface LobbyWireCodec {
    readonly maxMessageBytes: number
    decodeClient(text: string): LobbyInboundFrame
    encodeServer(frame: LobbyOutboundFrame): string
    validateRequest(type: string, payload: unknown): unknown
    validateResponse(type: string, response: unknown): unknown
    validatePush(type: string, data: unknown): { readonly type: string; readonly data: unknown }
}

export type LobbyRouteHandler = (context: LobbyConnectionContext, payload: unknown) => Promise<unknown>

export interface LobbyRouteRegistry {
    has(type: string): boolean
    execute(type: string, context: LobbyConnectionContext, payload: unknown): Promise<unknown>
    /** 启动时用 shared 路由全集校验唯一 handler；不能只靠首个请求发现遗漏。 */
    assertComplete?(): void
}

export interface LobbyServerOptions {
    readonly host: string
    readonly port: number
    readonly authTimeoutMs: number
    readonly handlerTimeoutMs: number
    readonly rateLimitCapacity: number
    readonly rateLimitRefillPerSecond: number
    readonly auth: LobbyAuthProvider
    readonly wire: LobbyWireCodec
    readonly routes: LobbyRouteRegistry
    /**
     * 强制下线 push 的业务 data 由 server/shared 契约构造；engine 不猜测其形状。
     * 关闭码一并传入，因为推送原因与关闭码必须同源（4901/4902/4903 语义）。
     */
    readonly makeForceLogoutPush?: (
        error: LobbyWireBusinessError,
        closeCode: number,
    ) => { readonly type: string; readonly data: unknown }
}

interface TokenBucket {
    tokens: number
    updatedAt: number
}

class LobbyServerConnection {
    private state: 'awaiting-auth' | 'ready' | 'closed' = 'awaiting-auth'
    private context?: LobbyConnectionContext
    private authTimer?: ReturnType<typeof setTimeout>
    private readonly bucket: TokenBucket
    private chain: Promise<void> = Promise.resolve()
    private closeHandled = false

    constructor(
        readonly id: string,
        readonly socket: WebSocket,
        readonly ip: string,
        private readonly server: LobbyServer,
    ) {
        this.bucket = { tokens: server.options.rateLimitCapacity, updatedAt: Date.now() }
    }

    start(): void {
        this.authTimer = setTimeout(() => {
            if (this.state === 'awaiting-auth') this.closeWithControl('AUTH_TIMEOUT', '认证超时', 1008)
        }, this.server.options.authTimeoutMs)
    }

    receive(text: string): void {
        this.enqueue(async () => {
            let frame: LobbyInboundFrame
            try {
                frame = this.server.options.wire.decodeClient(text)
            } catch {
                this.closeWithControl('INVALID_FRAME', '非法协议帧', 1007)
                return
            }
            await this.dispatch(frame)
        })
    }

    rejectBinary(): void {
        this.closeWithControl('BINARY_FRAME_UNSUPPORTED', 'Lobby 仅接受文本帧', 1003)
    }

    async onClosed(): Promise<void> {
        if (this.closeHandled) return
        this.closeHandled = true
        this.state = 'closed'
        if (this.authTimer) clearTimeout(this.authTimer)
        const context = this.context
        this.context = undefined
        if (context) await this.server.options.auth.releaseOnline?.(context)
        this.server.removeConnection(this)
    }

    async push(type: string, data: unknown): Promise<boolean> {
        if (this.state !== 'ready') return false
        try {
            const push = this.server.options.wire.validatePush(type, data)
            return this.send({ kind: 'push', push })
        } catch {
            return false
        }
    }

    async sync(data: unknown): Promise<boolean> {
        if (this.state !== 'ready') return false
        try {
            return this.send({ kind: 'sync', sync: data })
        } catch {
            return false
        }
    }

    forceLogout(error: LobbyWireBusinessError, closeCode: number): void {
        if (this.state === 'closed') return
        const push = this.server.options.makeForceLogoutPush?.(error, closeCode)
        if (push) this.send({ kind: 'push', push })
        this.send({ kind: 'close', code: closeCode, reason: error.msg })
        this.close(closeCode, error.msg)
    }

    private enqueue(task: () => Promise<void>): void {
        this.chain = this.chain.then(task).catch(() => {
            // 协议错误已通过 wire 响应；不记录原始帧，避免令牌/业务数据泄露到日志。
            this.closeWithControl('INVALID_FRAME', '请求处理失败', 1011)
        })
    }

    private async dispatch(frame: LobbyInboundFrame): Promise<void> {
        if (this.state === 'awaiting-auth') {
            if (frame.kind === 'auth') await this.authenticate(frame)
            else if (frame.kind === 'ping') this.send({ kind: 'pong', nonce: frame.nonce })
            else this.closeWithControl('INVALID_FRAME', '尚未完成认证', 1008)
            return
        }
        if (this.state !== 'ready') return
        if (frame.kind === 'auth') {
            this.closeWithControl('AUTH_ALREADY_COMPLETED', '连接已完成认证', 1008)
            return
        }
        if (frame.kind === 'ping') {
            this.send({ kind: 'pong', nonce: frame.nonce })
            return
        }
        if (frame.kind === 'pong') return
        if (frame.kind !== 'rpc') return
        if (!this.consumeRateLimit()) {
            this.sendReply(frame.rpc.id, { code: 'RATE_LIMITED', msg: '请求过于频繁' })
            return
        }
        const context = this.context!
        const activeError = await this.server.options.auth.validateActive(context)
        if (activeError) {
            this.sendReply(frame.rpc.id, activeError)
            return
        }
        await this.executeRpc(context, frame.rpc)
    }

    private async authenticate(frame: LobbyInboundAuth): Promise<void> {
        try {
            const identity = await this.server.options.auth.authenticate({
                token: frame.token,
                sId: frame.sId,
                ip: this.ip,
                reconnect: frame.reconnect === true,
            })
            if (!identity.uid || identity.sId !== frame.sId || !identity.sessionEpoch) {
                throw new Error('invalid trusted identity')
            }
            const context: LobbyConnectionContext = { ...identity, connectionId: this.id, ip: this.ip }
            await this.server.options.auth.claimOnline?.(context)
            if (this.state === 'closed') {
                await this.server.options.auth.releaseOnline?.(context)
                return
            }
            this.context = context
            this.state = 'ready'
            if (this.authTimer) clearTimeout(this.authTimer)
            this.send({ kind: 'auth.ok', uid: identity.uid, sId: identity.sId })
        } catch (error) {
            const rejection = asAuthRejection(error)
            if (!rejection) {
                this.send({ kind: 'auth.error', err: { code: 'AUTH_REQUIRED', msg: '认证失败' } })
                this.close(1008, 'Authentication Failed')
                return
            }
            if (rejection.forceLogout) {
                const push = this.server.options.makeForceLogoutPush?.(rejection, rejection.closeCode)
                if (push) this.send({ kind: 'push', push })
            }
            this.send({ kind: 'auth.error', err: { code: rejection.code, msg: rejection.msg } })
            this.close(rejection.closeCode, rejection.msg)
        }
    }

    private async executeRpc(
        context: LobbyConnectionContext,
        rpc: { readonly id: string; readonly type: string; readonly payload?: unknown },
    ): Promise<void> {
        if (!this.server.options.routes.has(rpc.type)) {
            this.sendReply(rpc.id, { code: 'UNKNOWN_TYPE', msg: '未知请求类型' })
            return
        }
        let payload: unknown
        try {
            payload = this.server.options.wire.validateRequest(rpc.type, rpc.payload)
        } catch {
            this.sendReply(rpc.id, { code: 'INVALID_PAYLOAD', msg: '请求参数无效' })
            return
        }
        try {
            const result = await withTimeout(
                this.server.executeSerialized(context, () =>
                    this.server.options.routes.execute(rpc.type, context, payload),
                ),
                this.server.options.handlerTimeoutMs,
            )
            const outcome = isLobbyRouteOutcome(result) ? result : lobbyRouteOutcome(result)
            const data = this.server.options.wire.validateResponse(rpc.type, outcome.data)
            this.send({
                kind: 'reply',
                reply: outcome.sync === undefined
                    ? { id: rpc.id, ok: true, data }
                    : { id: rpc.id, ok: true, data, sync: outcome.sync },
            })
        } catch (error) {
            const expected = asBusinessError(error)
            this.sendReply(rpc.id, expected ?? { code: 'INTERNAL', msg: '服务器内部错误' })
        }
    }

    private sendReply(id: string, err: LobbyWireBusinessError): void {
        this.send({ kind: 'reply', reply: { id, ok: false, err } })
    }

    private consumeRateLimit(): boolean {
        const now = Date.now()
        const elapsedSeconds = Math.max(0, now - this.bucket.updatedAt) / 1000
        this.bucket.tokens = Math.min(
            this.server.options.rateLimitCapacity,
            this.bucket.tokens + elapsedSeconds * this.server.options.rateLimitRefillPerSecond,
        )
        this.bucket.updatedAt = now
        if (this.bucket.tokens < 1) return false
        this.bucket.tokens -= 1
        return true
    }

    private send(frame: LobbyOutboundFrame): boolean {
        if (this.state === 'closed' || this.socket.readyState !== WebSocket.OPEN) return false
        try {
            const text = this.server.options.wire.encodeServer(frame)
            this.socket.send(text, () => undefined)
            return true
        } catch {
            return false
        }
    }

    private closeWithControl(code: string, msg: string, closeCode: number): void {
        this.send({ kind: 'control.error', err: { code, msg } })
        this.close(closeCode, msg)
    }

    private close(code: number, reason: string): void {
        if (this.state === 'closed') return
        this.state = 'closed'
        if (this.authTimer) clearTimeout(this.authTimer)
        try {
            this.socket.close(code, reason)
        } catch {
            /* socket is already gone */
        }
    }
}

/** 原生 WebSocket Lobby 服务器：全量路由、鉴权和 wire 校验均通过注入的真源实现。 */
export class LobbyServer {
    private httpServer?: http.Server
    private wsServer?: WebSocketServer
    private nextConnectionId = 1
    private readonly connections = new Map<string, LobbyServerConnection>()
    /** 同一可信身份跨连接仍串行；业务 handler 可在其内部再按领域 bind key 细分。 */
    private readonly identityChains = new Map<string, Promise<void>>()

    constructor(readonly options: LobbyServerOptions) {}

    async start(): Promise<void> {
        if (this.httpServer) throw new Error('lobby server already started')
        this.options.routes.assertComplete?.()
        const httpServer = http.createServer((_req, res) => {
            res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
            res.end('{"error":"not found"}')
        })
        const wsServer = new WebSocketServer({ noServer: true, maxPayload: this.options.wire.maxMessageBytes })
        httpServer.on('upgrade', (request, socket, head) => {
            wsServer.handleUpgrade(request, socket, head, (webSocket) =>
                wsServer.emit('connection', webSocket, request),
            )
        })
        wsServer.on('connection', (socket, request) => this.accept(socket, request.socket.remoteAddress ?? ''))
        await new Promise<void>((resolve, reject) => {
            httpServer.once('error', reject)
            httpServer.listen(this.options.port, this.options.host, () => {
                httpServer.off('error', reject)
                resolve()
            })
        })
        this.httpServer = httpServer
        this.wsServer = wsServer
    }

    async stop(): Promise<void> {
        for (const connection of this.connections.values())
            connection.forceLogout({ code: 'INTERNAL', msg: '服务停止' }, 1001)
        await Promise.all([
            this.wsServer ? new Promise<void>((resolve) => this.wsServer!.close(() => resolve())) : Promise.resolve(),
            this.httpServer
                ? new Promise<void>((resolve, reject) =>
                      this.httpServer!.close((error) => (error ? reject(error) : resolve())),
                  )
                : Promise.resolve(),
        ])
        this.wsServer = undefined
        this.httpServer = undefined
        this.connections.clear()
    }

    async push(connectionId: string, type: string, data: unknown): Promise<boolean> {
        return this.connections.get(connectionId)?.push(type, data) ?? false
    }

    async sync(connectionId: string, data: unknown): Promise<boolean> {
        return this.connections.get(connectionId)?.sync(data) ?? false
    }

    forceLogout(connectionId: string, error: LobbyWireBusinessError, closeCode: number): void {
        this.connections.get(connectionId)?.forceLogout(error, closeCode)
    }

    removeConnection(connection: LobbyServerConnection): void {
        this.connections.delete(connection.id)
    }

    /**
     * 认证上下文而非 payload 决定串行身份。前一个失败也会释放后续请求，避免一条异常把该用户永久卡住。
     */
    async executeSerialized<T>(context: LobbyConnectionContext, fn: () => Promise<T>): Promise<T> {
        const key = `${context.sId}:${context.uid}`
        const previous = this.identityChains.get(key) ?? Promise.resolve()
        const run = previous.then(fn, fn)
        const tail = run.then(
            () => undefined,
            () => undefined,
        )
        this.identityChains.set(key, tail)
        try {
            return await run
        } finally {
            if (this.identityChains.get(key) === tail) this.identityChains.delete(key)
        }
    }

    private accept(socket: WebSocket, ip: string): void {
        const connection = new LobbyServerConnection(String(this.nextConnectionId++), socket, ip, this)
        this.connections.set(connection.id, connection)
        connection.start()
        socket.on('message', (raw, isBinary) => {
            if (isBinary) {
                connection.rejectBinary()
                return
            }
            const text = rawText(raw)
            if (Buffer.byteLength(text, 'utf8') > this.options.wire.maxMessageBytes) {
                connection.rejectBinary()
                return
            }
            connection.receive(text)
        })
        socket.on('close', () => {
            void connection.onClosed()
        })
        socket.on('error', () => undefined)
    }
}

function asBusinessError(error: unknown): LobbyWireBusinessError | null {
    if (!error || typeof error !== 'object') return null
    const candidate = error as Partial<LobbyWireBusinessError>
    if (typeof candidate.code !== 'string' || typeof candidate.msg !== 'string') return null
    return { code: candidate.code, msg: candidate.msg }
}

function asAuthRejection(error: unknown): LobbyAuthRejection | null {
    if (error instanceof LobbyAuthRejection) return error
    return null
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('lobby handler timeout')), timeoutMs)
    })
    return Promise.race([promise, timeout]).then(
        (value) => {
            if (timer) clearTimeout(timer)
            return value as T
        },
        (error) => {
            if (timer) clearTimeout(timer)
            throw error
        },
    )
}

function rawText(raw: string | Buffer | ArrayBuffer | Buffer[]): string {
    if (typeof raw === 'string') return raw
    if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8')
    if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8')
    return raw.toString('utf8')
}
