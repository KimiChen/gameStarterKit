import type {
    IGameDemoAlchemyState,
    IGameDemoEmptyReq,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoAlchemy } from '../rules/GameDemoAlchemy'
import { GameDemoInventory } from '../rules/GameDemoInventory'
import { ActionGameDemo } from './ActionGameDemo'

export class ActionGameDemoAlchemyGet extends ActionGameDemo {
    async doAction(_req: IGameDemoEmptyReq, res: IGameDemoAlchemyState): Promise<void> {
        const player = await this.loadPlayer()
        res.assets = GameDemoInventory.assets(this.requireUser(), player)
        res.batch = GameDemoAlchemy.view(player)
    }
}
