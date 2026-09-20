import type { LobbyConnectionContext } from '@arthropoda/game-engine'
import type { LobbyRouteIdentity } from '../../startup/processPipe'
import type { NativeLobbyRouteRegistry } from './NativeLobbyRouteRegistry'

/**
 * 进程内原生 Lobby 路由执行点。
 *
 * 单进程由监听进程自己执行；多进程里被转发的目标 worker 用同一份登记表执行，
 * 因此校验、幂等闸、ServerTask、串行分组、锁与提交语义与单进程完全一致。
 */
export class NativeLobbyProcessRoutes {
    private routes?: NativeLobbyRouteRegistry

    install(routes: NativeLobbyRouteRegistry): void {
        this.routes = routes
    }

    /**
     * 卸载路由表。关闭原生 Lobby 后必须调用：否则残留的 handler 会在依赖（鉴权校验器、
     * 在线归属表、连接）已经释放后继续被跨进程请求命中，而不是 fail-closed。
     */
    reset(): void {
        this.routes = undefined
    }

    get installed(): boolean {
        return this.routes !== undefined
    }

    async execute(route: string, identity: LobbyRouteIdentity, payload: unknown): Promise<unknown> {
        const routes = this.routes
        if (!routes) throw { code: 'INTERNAL', msg: '目标进程未装载原生 Lobby 路由' }
        if (!routes.has(route)) throw { code: 'UNKNOWN_TYPE', msg: '未知请求类型' }
        // `executeForwarded` 而不是 `execute`：幂等闸已经在**持有连接的一端**进过了，
        // 这里再进一次会撞上那条 pending 租约（键在中心 Redis 上跨进程共享）。
        return routes.executeForwarded(route, forwardedContext(identity), payload)
    }
}

/**
 * 跨进程转发不重建会话复验：逐消息复验只在持有连接的进程做，转发发生在复验之后。
 * 这里只还原 handler 实际消费的身份字段，`sessionEpoch` / `connectionId` 留空而不是虚构值——
 * 将来若有 handler 依赖它们，会 fail-closed 而不是静默放行。
 */
function forwardedContext(identity: LobbyRouteIdentity): LobbyConnectionContext {
    return { uid: identity.uid, sId: identity.sId, sessionEpoch: '', connectionId: '', ip: '' }
}

/** 进程级单例：与 `RouteAction.processRouter` 一样，进程装配阶段安装一次。 */
export const nativeLobbyProcessRoutes = new NativeLobbyProcessRoutes()
