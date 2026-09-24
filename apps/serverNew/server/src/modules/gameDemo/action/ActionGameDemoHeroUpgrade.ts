import type {
    IGameDemoHeroUpgrade,
    IGameDemoHeroUpgradeReq,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoHeroTraining } from '../rules/GameDemoHeroTraining'
import { GameDemoInventory } from '../rules/GameDemoInventory'
import { ActionGameDemo } from './ActionGameDemo'

export class ActionGameDemoHeroUpgrade extends ActionGameDemo {
    async doAction(req: IGameDemoHeroUpgradeReq, res: IGameDemoHeroUpgrade): Promise<void> {
        const player = await this.requirePlayer()
        res.consumed = GameDemoHeroTraining.upgrade(player, req.pill, req.count)
        res.assets = GameDemoInventory.assets(this.requireUser(), player)
        res.hero = GameDemoHeroTraining.view(player)
    }
}
