import type {
    IGameDemoGuildInviteReq,
    IGameDemoGuildState,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoGuildRoster } from '../rules/GameDemoGuildRoster'
import { ActionGameDemoGuild } from './ActionGameDemoGuild'

/** 盟主按玩家 ID 邀请；目标须已开放玩法（只读目标玩家 Bean，不在 Task Worker 写玩家）。 */
export class ActionGameDemoGuildInvite extends ActionGameDemoGuild {
    async doAction(req: IGameDemoGuildInviteReq, res: IGameDemoGuildState): Promise<void> {
        const directory = await this.directory()
        GameDemoGuildRoster.invite(directory, this.uid, req.targetUid, await this.isInitialized(req.targetUid))
        this.respond(directory, res)
    }
}
