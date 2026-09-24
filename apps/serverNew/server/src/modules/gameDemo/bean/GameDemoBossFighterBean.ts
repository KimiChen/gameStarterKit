import { Bean } from '@arthropoda/game-engine'

/** 本局参与者：血量、冷却、自动攻击意愿与累计伤害。 */
export class GameDemoBossFighterBean extends Bean {
    uid: int = 0
    generation: int = 0
    active: boolean = false
    hp: int = 0
    maxHp: int = 0
    autoAttack: boolean = false
    nextAttackAt: int = 0
    reviveAt: int = 0
    damage: int = 0
    damageSeq: int = 0
}
