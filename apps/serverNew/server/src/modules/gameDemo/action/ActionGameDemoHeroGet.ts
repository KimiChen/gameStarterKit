import type {
    IGameDemoEmptyReq,
    IGameDemoHeroState,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoHeroTraining } from '../rules/GameDemoHeroTraining'
import { GameDemoInventory } from '../rules/GameDemoInventory'
import { ActionGameDemo } from './ActionGameDemo'

export class ActionGameDemoHeroGet extends ActionGameDemo {
    async doAction(_req: IGameDemoEmptyReq, res: IGameDemoHeroState): Promise<void> {
        const player = await this.loadPlayer()
        res.assets = GameDemoInventory.assets(this.requireUser(), player)
        res.hero = GameDemoHeroTraining.view(player)
    }
}
