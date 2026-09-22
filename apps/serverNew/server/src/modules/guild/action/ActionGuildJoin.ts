import type { IGuildJoinReq, IGuildJoinRes } from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { GuildNativeLobbyStore } from '../lobby/GuildNativeLobbyStore'

export class ActionGuildJoin extends NativeLobbyAction {
    async doAction(req: IGuildJoinReq, res: IGuildJoinRes): Promise<void> {
        Object.assign(
            res,
            await new GuildNativeLobbyStore({
                registerCharacter: this.lobbyServices.registerCharacter,
                pushToUser: this.lobbyServices.pushToUser,
            }).join(this.lobbyConnection, req),
        )
    }

    async getBindId(call: { readonly req: unknown }): Promise<number | undefined> {
        const request = call.req as Partial<IGuildJoinReq>
        return typeof request.guildId === 'number' ? request.guildId : undefined
    }
}
