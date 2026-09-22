import { CronService, EngineInitHelper, ModSync, RouteAction } from '@arthropoda/game-engine'
import { DelayedActionQueueWorker } from '../runtime/scheduling/DelayedActionQueueWorker'
import { RuntimeCronScheduler } from '../runtime/scheduling/RuntimeCronScheduler'
import { GameEvent } from '../runtime/event/GameEvent'
import { nativeLobbyProcessRoutes } from '../runtime/lobby/NativeLobbyProcessRoutes'
import { AppStartEventArgs } from './AppStartEvent'
import { GameModuleLifecycle } from './GameModuleLifecycle'
import { GameRuntimeInitializer } from './GameRuntimeInitializer'
import {
    hasNativeLobbyEnvironment,
    installForwardedNativeLobbyRoutes,
    startConfiguredNativeLobby,
    type LobbyPushForwarder,
    type LobbySyncForwarder,
    type NativeLobbyRuntime,
} from './NativeLobbyRuntime'

let nativeLobby: NativeLobbyRuntime | undefined
let forwardedLobbyRoutes: { stop(): void } | undefined
let initialized = false
let shutdownPrepared = false
let removeSyncListener: (() => void) | undefined

export interface ServiceRuntimeOptions {
    directNetwork: boolean
    runSchedulers: boolean
    /**
     * 原生 Lobby 角色。缺省为「单进程=监听、多进程=不参与」，多进程装配必须显式指定，
     * 避免漏配时静默降级成单进程行为。
     * - `listen`：绑定原生端点并处理鉴权/wire。
     * - `forward`：不绑定端点，只装载路由表并把推送转发给监听进程。
     */
    nativeLobby?: {
        readonly role: 'listen' | 'forward'
        readonly forwardPush?: LobbyPushForwarder
        readonly forwardSync?: LobbySyncForwarder
    }
}

/**
 * 启动服务运行时。
 *
 * 客户端入口**只有**原生 Lobby：旧二进制网关（`ClientServer` + PB 编解码）已随 P6 删除，
 * 因此没配置 `NATIVE_LOBBY_*` 的进程没有客户端入口——这是显式结果，不是降级。
 *
 * 任何一步失败都必须整段回滚（见 `rollbackServiceRuntimeStart`）：`initialized` 是模块级状态，
 * 而失败可能落在角色校验、端点绑定、路由装载或调度器启动之间。不回滚就会留下一个
 * 「自称已初始化、实际是半成品」的进程——原生入口缺席、路由表可能已装载，
 * 重试还会被 `'service runtime already initialized'` 挡住。这正是「静默降级掩盖问题」。
 */
export async function initializeServiceRuntime(options: ServiceRuntimeOptions) {
    if (initialized) throw new Error('service runtime already initialized')
    // 先占位再启动：初始化期间本进程就视为「已初始化」，并发的关闭请求不会把它当成未启动而跳过清理。
    initialized = true
    shutdownPrepared = false
    try {
        await startServiceRuntime(options)
    } catch (error) {
        rollbackServiceRuntimeStart()
        throw error
    }
}

async function startServiceRuntime(options: ServiceRuntimeOptions) {
    if (SERVER_ID !== CP.service.sid) {
        throw new Error(`sid mismatch: command=${SERVER_ID}, config=${CP.service.sid}`)
    }

    await GameModuleLifecycle.run('service', 'persistence-ready')
    await GameRuntimeInitializer.init()
    await GameEvent.init()

    const lobbyRole = options.nativeLobby?.role ?? (options.directNetwork ? 'listen' : undefined)
    if (!lobbyRole && hasNativeLobbyEnvironment()) {
        throw new Error('native Lobby is configured but this process has no Lobby role assigned')
    }
    if (lobbyRole === 'forward' && (!options.nativeLobby?.forwardPush || !options.nativeLobby?.forwardSync)) {
        throw new Error('native Lobby forward role requires cross-process push and sync transports')
    }
    if (lobbyRole === 'listen') nativeLobby = await startConfiguredNativeLobby()
    else if (lobbyRole === 'forward' && !options.directNetwork)
        forwardedLobbyRoutes = installForwardedNativeLobbyRoutes(options.nativeLobby!.forwardPush!)

    installCommittedSyncDelivery(lobbyRole, options.nativeLobby?.forwardSync)

    if (options.runSchedulers) {
        await DelayedActionQueueWorker.init()
        await RuntimeCronScheduler.initCronTasks('service')
    }
    await GameModuleLifecycle.run('service', 'runtime-ready')
    await GameEvent.publish(new AppStartEventArgs())
    await GameModuleLifecycle.run('service', 'server-started')
}

/**
 * 把本模块持有的进程级状态恢复成「未初始化」。启动失败时必须调用。
 *
 * `initialized` 是模块级状态，而失败发生在中间步骤（端点绑定、路由装载）。不回滚就会同时出现
 * 「自称已初始化」与「基础设施半成品」：本进程既不再重试、又缺少原生入口。残留的路由表尤其
 * 危险——它的依赖（鉴权校验器、在线归属、连接）已经释放，继续被跨进程请求命中就是静默执行，
 * 而不是 fail-closed。
 */
export function rollbackServiceRuntimeStart(): void {
    removeSyncListener?.()
    removeSyncListener = undefined
    nativeLobby = undefined
    forwardedLobbyRoutes = undefined
    nativeLobbyProcessRoutes.reset()
    initialized = false
    shutdownPrepared = false
}

/** 本进程是否持有原生 Lobby 端点；只有监听进程会返回运行时。 */
export function nativeLobbyRuntime(): NativeLobbyRuntime | undefined {
    return nativeLobby
}

export async function shutdownServiceRuntime() {
    if (!initialized) return
    await prepareServiceRuntimeShutdown()
    await nativeLobby?.stop()
    forwardedLobbyRoutes?.stop()
    removeSyncListener?.()
    removeSyncListener = undefined
    // 关闭后必须卸载进程级路由表：残留的 handler 会继续被跨进程请求命中，而它依赖的
    // 鉴权校验器与在线归属已经释放，那是「静默执行」而不是 fail-closed。
    nativeLobbyProcessRoutes.reset()
    await EngineInitHelper.stopInfrastructure()
    nativeLobby = undefined
    forwardedLobbyRoutes = undefined
    initialized = false
}

/**
 * 提交后同步的投递目标：**排除发起本次调用的那个用户**。
 *
 * 他的变更已经由 `ObjectAction.result` 附到 `reply.sync`，再 push 一次就是同一份数据走两条路，
 * 客户端会把它当成两次变更（版本推进两次、覆盖正在编辑的本地状态）。其余在线用户走主动 sync。
 *
 * 非对象出口（后台 Action、cron、内部动作）没有请求者，全部走主动 sync。
 */
export function committedSyncTargets(
    changes: { [key: number]: unknown },
    call: unknown,
): Array<{ readonly internalUid: number; readonly sync: { readonly mods: unknown } }> {
    const caller = call as { readonly responseTransport?: unknown; readonly uId?: unknown } | undefined
    const replyUid = caller?.responseTransport === 'object' && typeof caller.uId === 'number' ? caller.uId : undefined
    const targets: Array<{ internalUid: number; sync: { mods: unknown } }> = []
    for (const [rawUid, mods] of Object.entries(changes)) {
        const internalUid = Number(rawUid)
        if (!Number.isSafeInteger(internalUid) || internalUid < 1) continue
        if (internalUid === replyUid) continue
        targets.push({ internalUid, sync: { mods } })
    }
    return targets
}

/**
 * 所有 Action 都在 Redis 成功提交后由 SyncReceiptTask 进入这里。请求发起者的数据由
 * ObjectAction.result 附到 reply.sync，避免同一变化既 reply 又 push；其余在线用户以及
 * 无请求上下文的后台 Action 走主动 sync 帧。
 *
 * 逐 uid 隔离投递失败：一个用户的通道故障不能饿死同一批里其他在线用户。业务数据此时已经提交，
 * 投递本身也只是「尽力而为」——失败只记日志，⛔ 不要上抛（上抛会把已提交改写成业务失败）。
 */
function installCommittedSyncDelivery(
    role: 'listen' | 'forward' | undefined,
    forwardSync: LobbySyncForwarder | undefined,
): void {
    removeSyncListener?.()
    removeSyncListener = undefined
    if (!role) return
    removeSyncListener = ModSync.onCommitted(async (changes, call) => {
        if (!changes) return
        for (const target of committedSyncTargets(changes, call)) {
            try {
                if (role === 'listen') {
                    await nativeLobby?.syncByInternalUid(target.internalUid, SERVER_ID, target.sync)
                } else {
                    await forwardSync?.(target.internalUid, SERVER_ID, target.sync)
                }
            } catch (error) {
                Log.error(`native Lobby committed sync delivery failed uid:${target.internalUid}`, error)
            }
        }
    })
}

export async function prepareServiceRuntimeShutdown() {
    if (!initialized || shutdownPrepared) return
    shutdownPrepared = true
    await RouteAction.waitDealAction()
    DelayedActionQueueWorker.stop()
    CronService.stopAndClearCronTask()
}
