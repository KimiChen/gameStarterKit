import { PracticeBean } from '../practice/PracticeBean'
import { PropBean } from '../props/PropBean'
import { EquipPracticeBean } from '../practice/EquipPracticeBean'
import { PracticeNpcSkinBean } from '../practice/PracticeNpcSkinBean'

export interface UserPracticeBean {
    /**
     * 已经进入过的修炼地图id
     */
    enteredMapIds?: Map<int, int>
    /**
     * 修炼房间信息
     */
    practiceInfo?: Map<int, PracticeBean>
    /**
     * 当前修炼场景
     */
    practiceId: int
    /**
     * 挂机收益-上次结算挂机收益时间
     */
    settledPracticeTime: int
    /**
     * 挂机收益-累计奖励
     */
    hangUpAwards?: Map<int, PropBean>
    /**
     * 挂机收益-已经结算了多少份奖励（每分钟一份）
     */
    settledNum: int
    /**
     * 切换场景会先把击杀奖励放入NPC中
     */
    npcPracticeAwards?: Map<int, PropBean>
    /**
     * 挂机收益-上次结算杀敌数时间
     */
    settledKilledTime: int
    /**
     * 修炼宝箱产出限制
     */
    practiceBoxLimit?: Map<int, int>
    /**
     * 修炼杀敌数量
     */
    practiceKilledNum: int
    /**
     * 修炼装备
     */
    practiceEquips?: Map<int, EquipPracticeBean>
    /**
     * 挂机收益-上次领取时间
     */
    hangUpAwardTime: int
    /**
     * 修炼NPC皮肤列表
     */
    practiceNpcSkins?: Map<int, PracticeNpcSkinBean>
    /**
     * 当前修炼NPC突破等级
     */
    practiceNpcBreakLv: int
    /**
     * 当前修炼NPC等级
     */
    practiceNpcLv: int
    /**
     * 修炼已领取体力ID
     */
    practicePowerIds?: int[]
    /**
     * 修炼NPC当前穿戴的皮肤id
     */
    practiceNpcSkinId: int
    /**
     * 快速挂机次数，按日重置
     */
    quickHangUpTimes: int
    /**
     * 修炼NPC今日已攻击次数
     */
    practiceNpcTimes: int
    /**
     * 看广告快速挂机次数，按日重置
     */
    freeQuickHangUpTimes: int
    /**
     * 修炼最后一次杀敌提交时间
     */
    practiceKilledTime: int
    /**
     * 修炼NPC攻击次数上限
     */
    practiceNpcTimesLimit: int
    /**
     * 修炼NPC境界皮肤奖励是否已领取
     */
    practiceNpcIsAward: boolean
}
