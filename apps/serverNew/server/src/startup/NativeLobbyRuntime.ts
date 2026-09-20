import { LobbyServer } from '@arthropoda/game-engine'
import {
    ForceLogoutReason,
    LobbyPush,
    forceLogoutReasonOf,
    type ForceLogoutReasonType,
} from '../../generated/lobby-contract/protocol/lobbyRpc'
import { NativeLobbyAuthProvider } from '../runtime/identity/NativeLobbyAuthProvider'
import { NativeLobbyIdentityMap } from '../runtime/identity/NativeLobbyIdentityMap'
import { WebPlatformSessionVerifier } from '../runtime/identity/WebPlatformSessionVerifier'
import { nativeLobbyProcessRoutes } from '../runtime/lobby/NativeLobbyProcessRoutes'
import { assembleNativeLobbyRoutes } from '../runtime/lobby/NativeLobbyRoutes'
import type { NativeLobbyRouteRegistry } from '../runtime/lobby/NativeLobbyRouteRegistry'

export interface NativeLobbyRuntime {
    stop(): Promise<void>
    /** 在持有连接的进程里写一条领域推送；没有该 uid/sId 的在线连接时返回 false。 */
    push(uid: string, sId: number, type: string, data: unknown): Promise<boolean>
    /** 运营强制下线（4903）；没有在线连接时返回 false。 */
    revoke(uid: string, sId: number): boolean
    /** 运营后台按引擎内部 role_id 强制下线；只定位当前在线连接。 */
    revokeByInternalUid(internalUid: number, sId: number): boolean
    /** 按关闭码语义踢人：4901 封禁 / 4902 顶号 / 4903 运营下线。 */
    kick(uid: string, sId: number, reason: ForceLogoutReasonType): boolean
}

/**
 * 原生入口只由显式环境配置开启。
 * 多进程下只有承担监听的进程绑定端点，其余 worker 只装载路由表——跨进程转发的目标 worker
 * 必须能按字符串路由找到 handler，所以「装载路由」与「绑定端点」是两件事。
 */
export type NativeLobbyRole = 'off' | 'listen' | 'forward'

/** 非监听进程把 Lobby 推送交给监听进程的传输；由多进程装配注入。 */
export type LobbyPushForwarder = (uid: string, sId: number, type: string, data: unknown) => Promise<boolean>

interface NativeLobbyConfiguration {
    readonly host: string
    readonly port: number
    readonly webPlatformOrigin: string
    readonly serviceId: string
    readonly serviceSecret: string
}

/**
 * 只有监听进程调用：绑定端点，装配鉴权、限流、wire 编解码与路由表。
 * 端点端口必须与旧客户端/内网端口不同，否则会把两条通道混在一起。
 */
export async function startConfiguredNativeLobby(): Promise<NativeLobbyRuntime | undefined> {
    const config = nativeLobbyConfiguration(process.env)
    if (!config) return undefined
    if (
        config.port === CP.service.clientPort ||
        config.port === CP.service.internalPort ||
        config.port === CP.service.healthPort
    ) {
        throw new Error('NATIVE_LOBBY_PORT must differ from legacy client, internal and probe ports')
    }

    const verifier = new WebPlatformSessionVerifier({
        origin: config.webPlatformOrigin,
        serviceId: config.serviceId,
        serviceSecret: config.serviceSecret,
    })
    const identities = new NativeLobbyIdentityMap()
    // 装配顺序是环形的：推送出口要用到 server，server 要用到路由表，路由表要用到推送出口。
    // 用一次性的持有对象打破环，三者都是 const，也不会出现「闭包引用未初始化变量」。
    const lobby: { auth?: NativeLobbyAuthProvider; server?: LobbyServer } = {}
    const pushToUser = async (uid: string, sId: number, type: string, data: unknown) => {
        const connectionId = lobby.auth?.connectionId(uid, sId)
        return connectionId === undefined ? false : (lobby.server?.push(connectionId, type, data) ?? false)
    }
    const assembly = assembleNativeLobbyRoutes({
        identities,
        registerCharacter: (uid, sId) => verifier.registerCharacter(uid, sId),
        pushToUser,
    })
    // 监听进程同样把路由表装进进程级执行点，避免出现「同一进程两份路由」的第二种执行语义。
    nativeLobbyProcessRoutes.install(assembly.routes)
    const auth = new NativeLobbyAuthProvider({
        verifier,
        identities,
        // 本进程只服务启动参数固定的区服；客户端请求别的区服在回源之前就被拒绝。
        serverId: SERVER_ID,
        onAuthenticated: (uid, internalUid, sId) => assembly.onAuthenticated(uid, internalUid, sId),
        // 会话结束的业务离线收尾由所属模块贡献（见 `NativeLobbyRouteServices.onReleased`）；
        // 只有持有连接的监听进程会触发，非监听 worker 组装出的钩子不会被调用。
        onReleased: (identity) => assembly.onReleased(identity),
    })
    lobby.auth = auth

    const server = new LobbyServer({
        host: config.host,
        port: config.port,
        authTimeoutMs: CP.service.authTimeoutMs,
        handlerTimeoutMs: 10_000,
        // 与客户端可观察行为冻结值一致；不要让原生入口因较宽的服务端桶而绕过限流语义。
        rateLimitCapacity: 20,
        rateLimitRefillPerSecond: 10,
        auth,
        wire: assembly.wire,
        routes: assembly.routes,
        makeForceLogoutPush: (_error, closeCode) => ({
            type: LobbyPush.ForceLogout,
            // 推送原因与关闭码同源：4901 封禁 / 4902 顶号 / 4903 运营下线。
            data: { reason: forceLogoutReasonOf(closeCode) ?? ForceLogoutReason.Replaced },
        }),
    })
    lobby.server = server
    auth.setForceLogout((connectionId, error, closeCode) => server.forceLogout(connectionId, error, closeCode))
    try {
        await server.start()
    } catch (error) {
        verifier.close()
        throw error
    }
    return {
        push: pushToUser,
        revoke: (uid, sId) => auth.revoke(uid, sId),
        revokeByInternalUid: (internalUid, sId) => auth.revokeByInternalUid(internalUid, sId),
        kick: (uid, sId, reason) => auth.kick(uid, sId, reason),
        async stop() {
            await server.stop()
            verifier.close()
        },
    }
}

/**
 * 非监听 worker 调用：只装载路由表，使跨进程转发的请求能在本进程执行。
 * 推送必须转给监听进程——只有持有连接的一端能写 wire 消息。
 */
export function installForwardedNativeLobbyRoutes(
    forwardPush: LobbyPushForwarder,
): { readonly routes: NativeLobbyRouteRegistry; stop(): void } | undefined {
    const config = nativeLobbyConfiguration(process.env)
    if (!config) return undefined
    const verifier = new WebPlatformSessionVerifier({
        origin: config.webPlatformOrigin,
        serviceId: config.serviceId,
        serviceSecret: config.serviceSecret,
    })
    const assembly = assembleNativeLobbyRoutes({
        identities: new NativeLobbyIdentityMap(),
        registerCharacter: (uid, sId) => verifier.registerCharacter(uid, sId),
        pushToUser: forwardPush,
    })
    nativeLobbyProcessRoutes.install(assembly.routes)
    return {
        routes: assembly.routes,
        stop: () => verifier.close(),
    }
}

/** 只有 shared 声明的三种强制下线原因可以跨进程传递；其它值一律拒绝，不猜默认原因。 */
export function isForceLogoutReason(value: string): value is ForceLogoutReasonType {
    return (Object.values(ForceLogoutReason) as string[]).includes(value)
}

/** 环境是否显式配置了原生入口；配置不完整时 `nativeLobbyConfiguration` 会直接报错而不是降级。 */
export function hasNativeLobbyEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
    return [
        'NATIVE_LOBBY_HOST',
        'NATIVE_LOBBY_PORT',
        'WEBPLATFORM_INTERNAL_ORIGIN',
        'WEBPLATFORM_SERVICE_ID',
        'WEBPLATFORM_SERVICE_SECRET',
    ].some((name) => env[name] !== undefined)
}

function nativeLobbyConfiguration(env: NodeJS.ProcessEnv): NativeLobbyConfiguration | undefined {
    const names = [
        'NATIVE_LOBBY_HOST',
        'NATIVE_LOBBY_PORT',
        'WEBPLATFORM_INTERNAL_ORIGIN',
        'WEBPLATFORM_SERVICE_ID',
        'WEBPLATFORM_SERVICE_SECRET',
    ] as const
    const supplied = names.filter((name) => env[name] !== undefined)
    if (supplied.length === 0) return undefined
    if (supplied.length !== names.length)
        throw new Error(
            `native Lobby configuration is incomplete: missing ${names.filter((name) => !env[name]).join(', ')}`,
        )
    const port = Number(env.NATIVE_LOBBY_PORT)
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('invalid NATIVE_LOBBY_PORT')
    return {
        host: env.NATIVE_LOBBY_HOST!,
        port,
        webPlatformOrigin: env.WEBPLATFORM_INTERNAL_ORIGIN!,
        serviceId: env.WEBPLATFORM_SERVICE_ID!,
        serviceSecret: env.WEBPLATFORM_SERVICE_SECRET!,
    }
}
