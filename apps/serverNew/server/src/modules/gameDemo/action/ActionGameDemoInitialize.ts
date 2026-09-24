import { millisecond } from '@arthropoda/game-engine'
import { GAME_DEMO_CONFIG } from '../../../../generated/lobby-contract/protocol/lobbyRpc/checks/gameDemo'
import type {
    IGameDemoAssets,
    IGameDemoWriteReq,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoInventory } from '../rules/GameDemoInventory'
import { GameDemoMailbox } from '../rules/GameDemoMailbox'
import { ActionGameDemo } from './ActionGameDemo'

/** 开放玩法并一次性发放开发资源：金币记入宿主 User.copper，丹药与欢迎邮件记入玩家 Bean。 */
export class ActionGameDemoInitialize extends ActionGameDemo {
    async doAction(_req: IGameDemoWriteReq, res: IGameDemoAssets): Promise<void> {
        if (!ActionGameDemo.devToolsEnabled()) throw { code: 'GAME_DEMO_DEV_DISABLED', msg: '测试资源入口未开放' }
        const user = this.requireUser()
        const player = await this.loadOrCreatePlayer()
        if (!player.initialized) {
            player.initialized = true
            user.copper += GAME_DEMO_CONFIG.initialGold
            player.pill += GAME_DEMO_CONFIG.initialPills.pill
            player.finePill += GAME_DEMO_CONFIG.initialPills.finePill
            GameDemoMailbox.deliver(
                player,
                'welcome:v1',
                '玩法验证奖励',
                GAME_DEMO_CONFIG.welcomeMailGold,
                millisecond(),
            )
        }
        const assets = GameDemoInventory.assets(user, player)
        res.initialized = assets.initialized
        res.gold = assets.gold
        res.items = assets.items
    }
}
