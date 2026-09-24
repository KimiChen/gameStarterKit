import type { ReadonlyBean } from '@arthropoda/game-engine'
import {
    GAME_DEMO_CONFIG,
    gameDemoAttack,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/checks/gameDemo'
import type { IGameDemoHero } from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import type { GameDemoPlayer } from '../bean/GameDemoPlayer'
import { GameDemoInventory } from './GameDemoInventory'

/** 英雄培养：消耗经验丹换经验，满级后多余的丹药不扣。 */
export class GameDemoHeroTraining {
    static view(player: GameDemoPlayer | ReadonlyBean<GameDemoPlayer> | undefined): IGameDemoHero {
        const level = player?.heroLevel ?? 1
        return { level, exp: player?.heroExp ?? 0, attack: gameDemoAttack(level) }
    }

    /** 返回实际消耗的丹药数。 */
    static upgrade(player: GameDemoPlayer, pill: 'normal' | 'fine', count: number): number {
        if (player.heroLevel >= GAME_DEMO_CONFIG.heroMaxLevel) throw { code: 'GAME_DEMO_HERO_MAX', msg: '英雄已满级' }
        const kind = pill === 'normal' ? 'pill' : 'finePill'
        const available = Math.min(count, player[kind])
        if (available < 1) throw { code: 'GAME_DEMO_INSUFFICIENT_ITEMS', msg: '经验丹不足' }
        let consumed = 0
        let level = player.heroLevel
        let exp = player.heroExp
        while (consumed < available && level < GAME_DEMO_CONFIG.heroMaxLevel) {
            consumed++
            exp += GAME_DEMO_CONFIG.pillExp[pill]
            while (exp >= GAME_DEMO_CONFIG.heroExpPerLevel && level < GAME_DEMO_CONFIG.heroMaxLevel) {
                exp -= GAME_DEMO_CONFIG.heroExpPerLevel
                level++
            }
        }
        GameDemoInventory.take(player, kind, consumed)
        player.heroLevel = level
        player.heroExp = level === GAME_DEMO_CONFIG.heroMaxLevel ? 0 : exp
        return consumed
    }
}
