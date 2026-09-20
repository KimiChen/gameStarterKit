import { GameModuleCatalog } from '../../startup/GameModuleCatalog'
import type { NativeLobbyIdentityResolver } from '../identity/NativeLobbyAuthProvider'
import { NativeLobbyContractCodec } from '../protocol/NativeLobbyContractCodec'
import {
    NativeLobbyRouteRegistry,
    type NativeLobbyReleasedIdentity,
    type NativeLobbyRouteServices,
} from './NativeLobbyRouteRegistry'

/** 组装结果：路由表 + wire codec + 认证成功/会话结束的钩子。 */
export interface NativeLobbyRouteAssembly {
    readonly routes: NativeLobbyRouteRegistry
    /** 监听进程用它做 wire 编解码；非监听进程不使用。 */
    readonly wire: NativeLobbyContractCodec
    /** 只有真正处理认证的进程需要调用；其它进程组装出的钩子不会被触发。 */
    onAuthenticated(uid: string, internalUid: number, sId: number): Promise<void>
    /** 同上：只有持有连接的监听进程会触发；会话结束（断线/顶号/被踢）时调用。 */
    onReleased(identity: NativeLobbyReleasedIdentity): Promise<void>
}

export interface NativeLobbyRouteAssemblyOptions {
    readonly identities: NativeLobbyIdentityResolver
    readonly registerCharacter: (uid: string, sId: number) => Promise<void>
    readonly pushToUser: (uid: string, sId: number, type: string, data: unknown) => Promise<boolean>
}

/**
 * 用所属模块贡献的 handler 组装原生 Lobby 路由表。
 *
 * 单进程的监听进程和多进程里的每个 worker 都执行同一份组装逻辑：跨进程转发时目标 worker
 * 必须能按字符串路由找到 handler，而 handler 是闭包、不能跨进程传递。
 */
export function assembleNativeLobbyRoutes(options: NativeLobbyRouteAssemblyOptions): NativeLobbyRouteAssembly {
    const wire = new NativeLobbyContractCodec()
    const routes = new NativeLobbyRouteRegistry({
        validateResponse: (route, response) => wire.validateResponse(route, response),
    })
    const authenticatedHandlers: Array<(uid: string, internalUid: number, sId: number) => Promise<void>> = []
    const releasedHandlers: Array<(identity: NativeLobbyReleasedIdentity) => Promise<void>> = []
    const services: NativeLobbyRouteServices = {
        identities: options.identities,
        registerCharacter: options.registerCharacter,
        pushToUser: options.pushToUser,
        onAuthenticated: (handler) => authenticatedHandlers.push(handler),
        onReleased: (handler) => releasedHandlers.push(handler),
    }
    for (const entry of GameModuleCatalog.systems.nativeLobby.entries) {
        if (entry.contribution.app === 'service' || entry.contribution.app === 'all') {
            entry.contribution.register(routes, services)
        }
    }
    return {
        routes,
        wire,
        async onAuthenticated(uid, internalUid, sId) {
            for (const handler of authenticatedHandlers) await handler(uid, internalUid, sId)
        },
        async onReleased(identity) {
            for (const handler of releasedHandlers) await handler(identity)
        },
    }
}
