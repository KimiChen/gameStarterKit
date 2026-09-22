import type { LobbyConnectionContext, NativeLobbyRouteServices } from '../lobby/NativeLobbyRouteRegistry'
import { GameAction } from './GameAction'

/**
 * Native Lobby 的显式 Store Action：它仍然由 RouteAction 执行，但不隐式加载 User Bean。
 *
 * 单玩家 Bean Action（如 income）继续直接继承 GameAction；跨玩家/事务型存储 Action
 * 使用本类，并通过 runtime 在调用边界注入可信外部身份和模块能力。这样业务 Action 不
 * 读取全局连接，也不再需要每个模块维护一份 Lobby route wrapper。
 */
export class NativeLobbyAction extends GameAction {
    private nativeContext?: {
        readonly connection: LobbyConnectionContext
        readonly services: NativeLobbyRouteServices
    }

    override async actionBefore(): Promise<void> {
        return
    }

    attachNativeLobbyContext(connection: LobbyConnectionContext, services: NativeLobbyRouteServices): void {
        this.nativeContext = { connection, services }
    }

    protected get lobbyConnection(): LobbyConnectionContext {
        if (!this.nativeContext) throw new Error('Native Lobby Action context is not attached')
        return this.nativeContext.connection
    }

    protected get lobbyServices(): NativeLobbyRouteServices {
        if (!this.nativeContext) throw new Error('Native Lobby Action context is not attached')
        return this.nativeContext.services
    }

    protected get lobbyUid(): string {
        return this.lobbyConnection.uid
    }

    protected get lobbySid(): number {
        return this.lobbyConnection.sId
    }
}
