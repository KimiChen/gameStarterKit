import type {
    IGameDemoGuildRespondReq,
    IGameDemoGuildState,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoGuildRoster } from '../rules/GameDemoGuildRoster'
import { ActionGameDemoGuild } from './ActionGameDemoGuild'

export class ActionGameDemoGuildRespond extends ActionGameDemoGuild {
    async doAction(req: IGameDemoGuildRespondReq, res: IGameDemoGuildState): Promise<void> {
        const directory = await this.directory()
        GameDemoGuildRoster.respond(directory, this.uid, req.inviteId, req.accept)
        this.respond(directory, res)
    }
}
