import type { IGuildLeaveRes } from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { GuildNativeLobbyStore } from '../lobby/GuildNativeLobbyStore'

export class ActionGuildLeave extends NativeLobbyAction {
    async doAction(_req: unknown, res: IGuildLeaveRes): Promise<void> {
        Object.assign(
            res,
            await new GuildNativeLobbyStore({
                registerCharacter: this.lobbyServices.registerCharacter,
                pushToUser: this.lobbyServices.pushToUser,
            }).leave(this.lobbyConnection),
        )
    }
}
