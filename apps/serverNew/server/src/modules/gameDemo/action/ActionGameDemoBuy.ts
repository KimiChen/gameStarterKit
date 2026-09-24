import { millisecond } from '@arthropoda/game-engine'
import type {
    IGameDemoAssets,
    IGameDemoBuyReq,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoInventory } from '../rules/GameDemoInventory'
import { GameDemoShop } from '../rules/GameDemoShop'
import { ActionGameDemo } from './ActionGameDemo'

/** 用宿主金币购买材料；扣款、入包与限购计数在同一次 Bean 提交里完成。 */
export class ActionGameDemoBuy extends ActionGameDemo {
    async doAction(req: IGameDemoBuyReq, res: IGameDemoAssets): Promise<void> {
        const user = this.requireUser()
        const player = await this.requirePlayer()
        GameDemoShop.buy(user, player, req.product, req.count, millisecond())
        const assets = GameDemoInventory.assets(user, player)
        res.initialized = assets.initialized
        res.gold = assets.gold
        res.items = assets.items
    }
}
