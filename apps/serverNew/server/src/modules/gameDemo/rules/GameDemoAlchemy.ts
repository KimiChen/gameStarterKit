import type { ReadonlyBean } from '@arthropoda/game-engine'
import { GAME_DEMO_CONFIG } from '../../../../generated/lobby-contract/protocol/lobbyRpc/checks/gameDemo'
import type { IGameDemoAlchemyBatch } from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import type { GameDemoPlayer } from '../bean/GameDemoPlayer'
import { GameDemoInventory } from './GameDemoInventory'

/** 炼丹：提交即扣材料、产出丹药并记下本批积分；客户端只播放固定时长的表现。 */
export class GameDemoAlchemy {
    static view(player: GameDemoPlayer | ReadonlyBean<GameDemoPlayer> | undefined): IGameDemoAlchemyBatch | null {
        if (!player?.batchSeq) return null
        return {
            id: player.batchSeq,
            count: player.batchCount,
            startedAt: player.batchStartedAt,
            pill: player.batchPill,
            finePill: player.batchFinePill,
            score: player.batchScore,
        }
    }

    /** `roll()` 返回 [0, 100) 的整数；由调用方注入以便测试。 */
    static start(player: GameDemoPlayer, count: number, now: number, roll: () => number): IGameDemoAlchemyBatch {
        const rules = GAME_DEMO_CONFIG.alchemy
        GameDemoInventory.take(player, 'herb', rules.herbPerBatch * count)
        GameDemoInventory.take(player, 'dew', rules.dewPerBatch * count)
        let finePill = 0
        for (let index = 0; index < count; index++) if (roll() < rules.fineChancePercent) finePill++
        const pill = count - finePill
        player.pill += pill
        player.finePill += finePill
        player.batchSeq++
        player.batchCount = count
        player.batchStartedAt = now
        player.batchPill = pill
        player.batchFinePill = finePill
        player.batchScore = pill * GAME_DEMO_CONFIG.pillScore.normal + finePill * GAME_DEMO_CONFIG.pillScore.fine
        return this.view(player)!
    }
}
