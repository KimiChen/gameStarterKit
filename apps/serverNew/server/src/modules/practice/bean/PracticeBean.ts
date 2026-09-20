import { PropBean } from '../../props/bean/PropBean'
import { DiffMap } from '@arthropoda/game-engine'
import { Bean } from '@arthropoda/game-engine'

export class PracticeBean extends Bean {
    /**
     * 场景ID
     */
    id: int = 0

    /**
     * 场景最近一次刷新时间
     */
    refreshTime: int = 0

    /**
     * 怪物数量
     */
    monsterNum: int = 0

    /**
     * 当前修炼场景轮次
     */
    turnId: int = 1

    /**
     * 当前修炼场景波次
     */
    waveId: int = 0

    /**
     * 当前修炼轮次BOSS是否可打
     */
    canTurnBoss: int = 0

    /**
     * 当前修炼是否完成，挑战完所有轮次的BOSS算完成
     */
    isFinish: boolean = false

    /**
     * 当前场景的怪物预收益
     */
    preAwards?: DiffMap<int, PropBean>

    /**
     * 可捡起的收益
     */
    killedAwards?: DiffMap<int, PropBean>
}
