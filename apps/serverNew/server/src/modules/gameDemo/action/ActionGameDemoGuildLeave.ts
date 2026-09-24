import type {
    IGameDemoGuildState,
    IGameDemoWriteReq,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoGuildRoster } from '../rules/GameDemoGuildRoster'
import { ActionGameDemoGuild } from './ActionGameDemoGuild'

export class ActionGameDemoGuildLeave extends ActionGameDemoGuild {
    async doAction(_req: IGameDemoWriteReq, res: IGameDemoGuildState): Promise<void> {
        const directory = await this.directory()
        GameDemoGuildRoster.leave(directory, this.uid)
        this.respond(directory, res)
    }
}
