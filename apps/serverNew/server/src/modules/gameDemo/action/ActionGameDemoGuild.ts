import type { IGameDemoGuildState } from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoGuildDirectory } from '../bean/GameDemoGuildDirectory'
import { GameDemoGuildRoster } from '../rules/GameDemoGuildRoster'
import type { GameDemoResource } from '../rules/GameDemoTaskGroups'
import { ActionGameDemoTask } from './ActionGameDemoTask'

/** 仙盟写入的公共入口：目录在仙盟串行组内加载、修改并回写当前玩家视图。 */
export abstract class ActionGameDemoGuild extends ActionGameDemoTask {
    protected readonly resource: GameDemoResource = 'guild'

    protected async directory(): Promise<GameDemoGuildDirectory> {
        return ActionGameDemoTask.loadOrCreate(GameDemoGuildDirectory)
    }

    protected respond(directory: GameDemoGuildDirectory, res: IGameDemoGuildState): void {
        const view = GameDemoGuildRoster.view(directory, this.uid)
        res.uid = view.uid
        res.guild = view.guild
        res.invitations = view.invitations
    }
}
