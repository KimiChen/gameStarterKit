import { PropBean } from '../props/PropBean'

export interface PracticeBean {
    /**
     * 场景ID
     */
    id: int
    /**
     * 场景最近一次刷新时间
     */
    refreshTime: int
    /**
     * 怪物数量
     */
    monsterNum: int
    /**
     * 当前修炼场景轮次
     */
    turnId: int
    /**
     * 当前修炼场景波次
     */
    waveId: int
    /**
     * 当前修炼轮次BOSS是否可打
     */
    canTurnBoss: int
    /**
     * 当前修炼是否完成，挑战完所有轮次的BOSS算完成
     */
    isFinish: boolean
    /**
     * 当前场景的怪物预收益
     */
    preAwards?: Map<int, PropBean>
    /**
     * 可捡起的收益
     */
    killedAwards?: Map<int, PropBean>
}
