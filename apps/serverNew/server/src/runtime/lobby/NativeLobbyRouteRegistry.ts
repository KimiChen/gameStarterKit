import {
    isLobbyRouteOutcome,
    lobbyRouteOutcome,
    executeObjectAction,
    type LobbyConnectionContext,
    type LobbyRouteHandler,
    type LobbyRouteOutcome,
    type LobbyRouteRegistry,
} from '@arthropoda/game-engine'
import { Actions as C2SActions } from '../../../generated/protocol/server/C2S/actions'
import {
    ALL_LOBBY_RPC_TYPES,
    LOBBY_RPC_CONTRACT_VERSIONS,
    LOBBY_RPC_ROUTE_MODES,
    type LobbyRpcIdemType,
    type LobbyRpcType,
} from '../../../generated/lobby-contract/protocol/lobbyRpc'
import type { NativeLobbyIdentityResolver } from '../identity/NativeLobbyAuthProvider'
import { NativeLobbyIdempotency } from './NativeLobbyIdempotency'
import { NativeLobbyPendingRoutes } from './NativeLobbyPendingRoutes'

/** 可信连接上下文由 engine 定义；这里转发一次，让业务 Action 只依赖运行时入口。 */
export type { LobbyConnectionContext }

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
    /**
     * 出站响应契约校验；幂等闸必须在提升为 done 之前调用它。
     *
     * 类型上可选是**故意**的：缺了它就必须在启动期 `assertComplete()` fail-closed，而不是靠
     * 类型系统逼调用方随便塞个桩函数把闸"看起来装上"。生产装配（`assembleNativeLobbyRoutes`）
     * 一定传真 codec；这里保留可缺省，是为了让「闸没接全」这件事能在运行期被表达并被测到。
     */
    readonly validateResponse?: (route: string, response: unknown) => unknown
    readonly idempotency?: NativeLobbyIdempotency
    /** schema-owned Lobby route uses the generated C2S Action registry. */
    readonly resolveInternalUid?: (uid: string, sId: number) => Promise<number>
    /** Capabilities and trusted connection context injected into generated Store Actions. */
    readonly actionServices?: NativeLobbyRouteServices
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
        return this.handlers.has(type as LobbyRpcType) || this.generatedAction(type) !== undefined
    }

    async execute(type: string, context: LobbyConnectionContext, payload: unknown): Promise<unknown> {
        const execute = async (): Promise<LobbyRouteOutcome> => {
            return this.executeHandler(type, context, payload)
        }
        if (LOBBY_RPC_ROUTE_MODES[type as LobbyRpcType] !== 'idempotent-write') return execute()

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
            execute,
            validate: (route, result) => {
                if (!isLobbyRouteOutcome(result)) throw new Error(`idempotent route did not return outcome: ${route}`)
                validateResponse(route, result.data)
                return result
            },
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
        const registeredHandler = this.handlers.get(type as LobbyRpcType)
        if (!registeredHandler && !this.generatedAction(type))
            throw new Error(`unregistered native Lobby route: ${type}`)
        return this.executeHandler(type, context, payload)
    }

    /**
     * 启动期路由完整性闸。
     *
     * ⚠ 期望集**不是** `ALL_LOBBY_RPC_TYPES`：shared 的 lobbyRpc registry 是**两代服务端共有**的 wire 面
     * （另一条产品线 MMO 在 `apps/server` 上实现 chat / party / world，并把域加进同一份声明面），
     * 所以「声明面 ∖ 注册面」里有一类是**归属另一条通道**的，不是本项目的欠账。
     *
     * 那类必须逐条登记在 `NativeLobbyPendingRoutes`（带原因），并与「声明面 ∖ 注册面」**双向对齐**：
     * 路由迁走（已注册）或从 shared 删除都会让登记陈旧 ⇒ 直接 fail，强制同批删行。
     * ⛔ 不要为了让启动通过而往登记表里塞「本项目该实现但还没实现」的路由 —— 那是把启动期 fail-fast
     * 换成永久静默。判定标准是**归属**，不是进度。
     */
    assertComplete(): void {
        const declared = new Set<string>(ALL_LOBBY_RPC_TYPES)
        const registered = new Set<string>(this.handlers.keys())
        if (this.options?.resolveInternalUid) {
            for (const type of ALL_LOBBY_RPC_TYPES) if (this.generatedAction(type)) registered.add(type)
        }

        // ① 注册面不得超出声明面：多出来的 handler 一定是路由名写错。
        const unexpected = [...registered].filter((type) => !declared.has(type))
        // ② 声明面里没注册的，必须逐条登记「归属另一条通道」，否则就是本项目的欠账。
        const missing = [...declared].filter((type) => !registered.has(type))
        const unowned = missing.filter((type) => !Object.prototype.hasOwnProperty.call(NativeLobbyPendingRoutes, type))
        // ③ 双向对齐：登记项必须仍是「声明了但没注册」的，否则登记已陈旧（迁移落地没删行 / shared 删了路由）。
        const stalePending = Object.keys(NativeLobbyPendingRoutes).filter(
            (type) => !declared.has(type) || registered.has(type),
        )
        const reasonlessPending = Object.entries(NativeLobbyPendingRoutes)
            .filter(([, reason]) => reason.trim().length === 0)
            .map(([type]) => type)

        if (unexpected.length || unowned.length || stalePending.length || reasonlessPending.length) {
            throw new Error(
                'native Lobby route registry mismatch: ' +
                    `unexpected=[${unexpected.join(', ')}]（注册了 shared 未声明的路由）, ` +
                    `unowned missing=[${unowned.join(', ')}]（既没注册、也没在 NativeLobbyPendingRoutes 登记归属）, ` +
                    `stale pending=[${stalePending.join(', ')}]（已注册或已不在 shared 声明面，应同批删除登记行）, ` +
                    `reasonless pending=[${reasonlessPending.join(', ')}]（登记必须写明归属原因）`,
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

    private generatedAction(type: string): (new () => unknown) | undefined {
        if (!this.options?.resolveInternalUid) return undefined
        // shared wire 面由两代服务端共用；MMO-owned routes stay explicitly pending
        // even though the schema generator emits their protocol metadata/actions.
        if (Object.prototype.hasOwnProperty.call(NativeLobbyPendingRoutes, type)) return undefined
        return (C2SActions as Record<string, new () => unknown>)[type]
    }

    private async executeHandler(
        type: string,
        context: LobbyConnectionContext,
        payload: unknown,
    ): Promise<LobbyRouteOutcome> {
        const handler = this.handlers.get(type as LobbyRpcType)
        if (handler) {
            const result = await handler(context, payload)
            return isLobbyRouteOutcome(result) ? result : lobbyRouteOutcome(result)
        }
        const actionClass = this.generatedAction(type)
        const resolveInternalUid = this.options?.resolveInternalUid
        if (!actionClass || !resolveInternalUid) throw new Error(`unregistered native Lobby route: ${type}`)
        const internalUid = context.internalUid ?? (await resolveInternalUid(context.uid, context.sId))
        const action = new actionClass() as {
            attachNativeLobbyContext?: (connection: LobbyConnectionContext, services: NativeLobbyRouteServices) => void
            actionBefore?: (call: unknown) => Promise<void> | void
            doAction?: (request: unknown, response: unknown) => Promise<void> | void
            getBindId?: (call: unknown) => Promise<number | undefined> | number | undefined
        }
        const actionServices = this.options?.actionServices
        if (actionServices && action.attachNativeLobbyContext) {
            action.attachNativeLobbyContext(context, actionServices)
        }
        const result = await executeObjectAction(
            type,
            payload,
            {},
            {
                getBindId: async (call) => action.getBindId?.call(action, call),
                actionBefore: action.actionBefore?.bind(action),
                doAction: async (request, response) => {
                    if (!action.doAction) throw new Error(`generated Action has no doAction: ${type}`)
                    await action.doAction(request, response)
                },
            },
            { uid: internalUid, externalUid: context.uid, sId: context.sId },
        )
        if (!result.ok) throw result.error
        return lobbyRouteOutcome(result.data, result.sync)
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
