import { GameDemoBossFighterBean } from '../gameDemo/GameDemoBossFighterBean'
import { GameDemoBossEventBean } from '../gameDemo/GameDemoBossEventBean'
import { GameDemoRewardBean } from '../gameDemo/GameDemoRewardBean'

export interface GameDemoBossRoom {
    id: int

    runNumber: int

    hp: int

    phase: string

    revision: int

    respawnAt: int
    /**
     * 本局开局时间；与房间序号一起构成奖励来源，Redis 重建后也不会与旧局重复。
     */
    startedAt: int

    nextCounterAt: int

    attackSeq: int

    eventSeq: int

    fighters?: Map<int, GameDemoBossFighterBean>

    events?: Map<int, GameDemoBossEventBean>
    /**
     * 上一局的奖励，在下一局开启前持续幂等登记投递。
     */
    rewards?: Map<int, GameDemoRewardBean>
}
