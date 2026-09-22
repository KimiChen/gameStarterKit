import type { IGuildGetEventsReq, IGuildGetEventsRes } from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { GuildNativeLobbyStore } from '../lobby/GuildNativeLobbyStore'

export class ActionGuildGetEvents extends NativeLobbyAction {
    async doAction(req: IGuildGetEventsReq, res: IGuildGetEventsRes): Promise<void> {
        Object.assign(
            res,
            await new GuildNativeLobbyStore({
                registerCharacter: this.lobbyServices.registerCharacter,
                pushToUser: this.lobbyServices.pushToUser,
            }).events(this.lobbyConnection, req),
        )
    }
}
