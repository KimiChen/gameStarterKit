import type {
    IGameDemoAssets,
    IGameDemoEmptyReq,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoInventory } from '../rules/GameDemoInventory'
import { ActionGameDemo } from './ActionGameDemo'

export class ActionGameDemoAssets extends ActionGameDemo {
    async doAction(_req: IGameDemoEmptyReq, res: IGameDemoAssets): Promise<void> {
        const assets = GameDemoInventory.assets(this.requireUser(), await this.loadPlayer())
        res.initialized = assets.initialized
        res.gold = assets.gold
        res.items = assets.items
    }
}
