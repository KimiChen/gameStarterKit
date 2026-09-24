import type {
    IGameDemoEmptyReq,
    IGameDemoGuildState,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoGuildDirectory } from '../bean/GameDemoGuildDirectory'
import { GameDemoGuildRoster } from '../rules/GameDemoGuildRoster'
import { ActionGameDemo } from './ActionGameDemo'

/** 仙盟目录是共享资源；查询只读，不进入仙盟串行组。 */
export class ActionGameDemoGuildGet extends ActionGameDemo {
    async doAction(_req: IGameDemoEmptyReq, res: IGameDemoGuildState): Promise<void> {
        const view = GameDemoGuildRoster.view(await GameDemoGuildDirectory.loadOnlyRead(1), this.requireUser().id)
        res.uid = view.uid
        res.guild = view.guild
        res.invitations = view.invitations
    }
}
