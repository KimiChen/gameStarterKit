import type { LobbyConnectionContext, LobbyRouteHandler, LobbyRouteRegistry } from '@arthropoda/game-engine'
import {
    ALL_LOBBY_RPC_TYPES,
    LOBBY_RPC_CONTRACT_VERSIONS,
    LOBBY_RPC_ROUTE_MODES,
    type LobbyRpcIdemType,
    type LobbyRpcType,
} from '../../../generated/lobby-contract/protocol/lobbyRpc'
import type { NativeLobbyIdentityResolver } from '../identity/NativeLobbyAuthProvider'
import { NativeLobbyIdempotency } from './NativeLobbyIdempotency'

/** 会话结束（断线 / 顶号 / 被踢）时回调的可信身份；只有当前连接被释放时才会触发。 */
export interface NativeLobbyReleasedIdentity {
    readonly uid: string
    readonly sId: number
    readonly internalUid: number
}

/** 路由模块可使用的跨域运行能力；不携带领域 handler，避免 runtime 维护第二份业务清单。 */
export interface NativeLobbyRouteServices {
    readonly identities: NativeLobbyIdentityResolver
    readonly registerCharacter: (uid: string, sId: number) => Promise<void>
    readonly pushToUser: (uid: string, sId: number, type: string, data: unknown) => Promise<boolean>
    readonly onAuthenticated: (handler: (uid: string, internalUid: number, sId: number) => Promise<void>) => void
    /**
     * 注册「会话结束」收尾：断线、顶号、被踢都会走到这里，且只在被释放的连接确实是该
     * uid/sId 的当前连接时触发。业务离线路径必须挂在这里，⛔ 不要再依赖连接级断线回调。
     */
    readonly onReleased: (handler: (identity: NativeLobbyReleasedIdentity) => Promise<void>) => void
}

export interface NativeLobbyRouteRegistryOptions {
    /** 出站响应契约校验；幂等闸必须在提升为 done 之前调用它。 */
    readonly validateResponse: (route: string, response: unknown) => unknown
    readonly idempotency?: NativeLobbyIdempotency
}

/** 原生 Lobby 的唯一业务路由登记点；处理器必须由所属模块贡献。 */
export class NativeLobbyRouteRegistry implements LobbyRouteRegistry {
    private readonly handlers = new Map<LobbyRpcType, LobbyRouteHandler>()
    private readonly idempotency?: NativeLobbyIdempotency

    constructor(private readonly options?: NativeLobbyRouteRegistryOptions) {
        this.idempotency = options?.idempotency ?? (options ? new NativeLobbyIdempotency() : undefined)
    }

    register(type: LobbyRpcType, handler: LobbyRouteHandler): void {
        if (this.handlers.has(type)) throw new Error(`duplicate native Lobby route: ${type}`)
        this.handlers.set(type, handler)
    }

    has(type: string): boolean {
        return this.handlers.has(type as LobbyRpcType)
    }

    async execute(type: string, context: LobbyConnectionContext, payload: unknown): Promise<unknown> {
        const handler = this.handlers.get(type as LobbyRpcType)
        if (!handler) throw new Error(`unregistered native Lobby route: ${type}`)
        if (LOBBY_RPC_ROUTE_MODES[type as LobbyRpcType] !== 'idempotent-write') return handler(context, payload)

        const idempotency = this.idempotency
        const validateResponse = this.options?.validateResponse
        if (!idempotency || !validateResponse) {
            throw new Error(`idempotent-write route requires the generic idempotency gate: ${type}`)
        }
        const idemType = type as LobbyRpcIdemType
        return idempotency.run({
            route: idemType,
            uid: context.uid,
            sId: context.sId,
            clientReqId: clientReqIdOf(payload),
            payload,
            contractVersion: LOBBY_RPC_CONTRACT_VERSIONS[idemType],
            execute: () => handler(context, payload),
            validate: (route, result) => validateResponse(route, result),
        })
    }

    /**
     * 跨进程转发入口：handler 由**本进程**执行，但幂等闸不在这里再进一次。
     *
     * 通用闸的语义是「每个逻辑请求恰好一次」，而它绑定的是**客户端重试**（同 clientReqId），
     * 因此它属于持有连接的那一端。被转发的目标进程只是这次请求的执行器：它若再进一次闸，
     * 就会撞上监听进程刚写下的 `pending` 租约（记录键在中心 Redis 上跨进程共享），
     * 把一次完全正常的请求判成 `IN_PROGRESS`，副作用一次都不会发生。
     *
     * ⛔ 不要在目标进程里「顺便」补一次闸；⛔ 也不要让监听进程跳过闸。
     */
    async executeForwarded(type: string, context: LobbyConnectionContext, payload: unknown): Promise<unknown> {
        const handler = this.handlers.get(type as LobbyRpcType)
        if (!handler) throw new Error(`unregistered native Lobby route: ${type}`)
        return handler(context, payload)
    }

    assertComplete(): void {
        const missing = ALL_LOBBY_RPC_TYPES.filter((type) => !this.handlers.has(type))
        const unexpected = [...this.handlers.keys()].filter(
            (type) => !(ALL_LOBBY_RPC_TYPES as readonly string[]).includes(type),
        )
        if (missing.length || unexpected.length) {
            throw new Error(
                `native Lobby route registry mismatch: missing=[${missing.join(', ')}], unexpected=[${unexpected.join(', ')}]`,
            )
        }
        // 幂等写路由没有通用闸就等于把「重试可能重复扣费」放进了活动链。
        const hasIdempotentWrite = ALL_LOBBY_RPC_TYPES.some(
            (type) => LOBBY_RPC_ROUTE_MODES[type] === 'idempotent-write',
        )
        if (hasIdempotentWrite && (!this.idempotency || !this.options?.validateResponse)) {
            throw new Error('native Lobby idempotent-write routes are registered without the generic idempotency gate')
        }
    }
}

function clientReqIdOf(payload: unknown): string {
    const value = (payload ?? {}) as { readonly clientReqId?: unknown }
    const clientReqId = value.clientReqId
    if (typeof clientReqId !== 'string' || clientReqId.length === 0 || clientReqId.length > 64) {
        throw { code: 'INVALID_PAYLOAD', msg: '请求参数无效' }
    }
    return clientReqId
}
