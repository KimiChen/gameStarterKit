import type {
    IGameDemoGuildCreateReq,
    IGameDemoGuildState,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoGuildRoster } from '../rules/GameDemoGuildRoster'
import { ActionGameDemoGuild } from './ActionGameDemoGuild'

export class ActionGameDemoGuildCreate extends ActionGameDemoGuild {
    async doAction(req: IGameDemoGuildCreateReq, res: IGameDemoGuildState): Promise<void> {
        if (!(await this.isInitialized(this.uid))) throw { code: 'GAME_DEMO_NOT_INITIALIZED', msg: '请先领取玩法资源' }
        const directory = await this.directory()
        GameDemoGuildRoster.create(directory, this.uid, req.name)
        this.respond(directory, res)
    }
}
