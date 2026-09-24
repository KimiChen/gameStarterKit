import type { ReadonlyBean } from '@arthropoda/game-engine'
import {
    GAME_DEMO_CONFIG,
    gameDemoBusinessDate,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/checks/gameDemo'
import type { IGameDemoShopPurchased } from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import type { User } from '../../user/bean/User'
import type { GameDemoPlayer } from '../bean/GameDemoPlayer'
import { GameDemoInventory } from './GameDemoInventory'

/** 材料商店：金币按固定价格换材料，每个业务日（UTC+8）限购。 */
export class GameDemoShop {
    static purchased(
        player: GameDemoPlayer | ReadonlyBean<GameDemoPlayer> | undefined,
        now: number,
    ): IGameDemoShopPurchased {
        if (!player || player.shopDay !== gameDemoBusinessDate(now)) return { herb: 0, dew: 0 }
        return { herb: player.shopHerb, dew: player.shopDew }
    }

    static buy(
        user: Pick<User, 'copper'>,
        player: GameDemoPlayer,
        product: 'herb' | 'dew',
        count: number,
        now: number,
    ) {
        const item = GAME_DEMO_CONFIG.shop.find((entry) => entry.id === product)!
        const day = gameDemoBusinessDate(now)
        if (player.shopDay !== day) {
            player.shopDay = day
            player.shopHerb = 0
            player.shopDew = 0
        }
        const bought = product === 'herb' ? player.shopHerb : player.shopDew
        if (bought + count > item.dailyLimit) throw { code: 'GAME_DEMO_LIMIT', msg: '超过今日限购数量' }
        GameDemoInventory.spendGold(user, item.price * count)
        player[product] += count
        if (product === 'herb') player.shopHerb += count
        else player.shopDew += count
    }
}
