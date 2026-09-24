import { millisecond } from '@arthropoda/game-engine'
import { gameDemoBusinessDate } from '../../../../generated/lobby-contract/protocol/lobbyRpc/checks/gameDemo'
import type {
    IGameDemoEmptyReq,
    IGameDemoShop,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoInventory } from '../rules/GameDemoInventory'
import { GameDemoShop } from '../rules/GameDemoShop'
import { ActionGameDemo } from './ActionGameDemo'

export class ActionGameDemoShop extends ActionGameDemo {
    async doAction(_req: IGameDemoEmptyReq, res: IGameDemoShop): Promise<void> {
        const now = millisecond()
        const player = await this.loadPlayer()
        res.assets = GameDemoInventory.assets(this.requireUser(), player)
        res.day = gameDemoBusinessDate(now)
        res.purchased = GameDemoShop.purchased(player, now)
    }
}
