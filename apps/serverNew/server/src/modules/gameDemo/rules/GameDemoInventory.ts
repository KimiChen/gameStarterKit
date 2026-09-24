import type { ReadonlyBean } from '@arthropoda/game-engine'
import type {
    IGameDemoAssets,
    IGameDemoItems,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import type { User } from '../../user/bean/User'
import type { GameDemoPlayer } from '../bean/GameDemoPlayer'

export type GameDemoItemKind = keyof IGameDemoItems
type PlayerView = GameDemoPlayer | ReadonlyBean<GameDemoPlayer>

/** 金币与玩法材料：金币是宿主 `User.copper`，材料和丹药在 `GameDemoPlayer`。 */
export class GameDemoInventory {
    static assets(user: Pick<User, 'copper'>, player: PlayerView | undefined): IGameDemoAssets {
        return {
            initialized: player?.initialized ?? false,
            gold: user.copper,
            items: {
                herb: player?.herb ?? 0,
                dew: player?.dew ?? 0,
                pill: player?.pill ?? 0,
                finePill: player?.finePill ?? 0,
            },
        }
    }

    static spendGold(user: Pick<User, 'copper'>, amount: number): void {
        if (user.copper < amount) throw { code: 'GAME_DEMO_INSUFFICIENT_GOLD', msg: '金币不足' }
        user.copper -= amount
    }

    static take(player: GameDemoPlayer, kind: GameDemoItemKind, amount: number): void {
        if (player[kind] < amount) throw { code: 'GAME_DEMO_INSUFFICIENT_ITEMS', msg: '材料不足' }
        player[kind] -= amount
    }

    static requireInitialized(player: PlayerView | undefined): void {
        if (!player?.initialized) throw { code: 'GAME_DEMO_NOT_INITIALIZED', msg: '请先领取玩法资源' }
    }
}
