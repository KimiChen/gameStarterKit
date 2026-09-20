import { AwardResponse } from '../../runtime/protocol/C2S/commom'
import { Service } from '../../runtime/protocol/ServiceType'

/**
 * 进入修炼场景
 */
export interface ReqPracticeEnterPractice extends Service<'Base'> {
    newPracticeId: int
}

export interface ResPracticeEnterPractice {
    award: AwardResponse
}

/**
 * 领取挂机奖励
 */
export interface ReqPracticeHangUpAward extends Service<'Base'> {}
export interface ResPracticeHangUpAward {
    award: AwardResponse
}

/**
 * 挂机收益同步
 */
export interface ReqPracticeHangUpSync extends Service<'Base'> {}

export interface killedAward {
    propId: int
    num: int
}

/**
 * 击杀怪物
 */
export interface ReqPracticeMonsterKilled extends Service<'Base'> {
    killedNum: int
    npcAttackTimes: int
    killedAwards: killedAward[]
}

export interface ResPracticeMonsterKilled {
    award: AwardResponse
}

/**
 * npc领取额外攻击次数
 */
export interface ReqPracticeNpcAssist extends Service<'Base'> {}
export interface ResPracticeNpcAssist {
    award: AwardResponse
}

/**
 * 领取NPC身上的奖励
 */
export interface ReqPracticeNpcAward extends Service<'Base'> {}

export interface ResPracticeNpcAward {
    award: AwardResponse
}

/**
 * NPC突破
 */
export interface ReqPracticeNpcBreakUp extends Service<'Base'> {}

export interface ReqPracticeNpcDaily extends Service<'Base'> {
    type: int // type=1表示早上，type=2表示中午，type=3表示晚上
}

/**
 * 修炼每日领取体力
 */
export interface ResPracticeNpcDaily {
    award: AwardResponse
}

/**
 * npc皮肤穿戴
 */
export interface ReqPracticeNpcSkinIn extends Service<'Base'> {
    skinId: int // 皮肤Id
}

export interface ResPracticeNpcSkinIn {
    award: AwardResponse
}

/**
 * NPC升级
 */
export interface ReqPracticeNpcUpLv extends Service<'Base'> {}

/**
 * 捡起宝箱
 */
export interface ReqPracticePickUpBox extends Service<'Base'> {
    type: int
    value: int
    targetId: int
}

export interface ResPracticePickUpBox {
    award: AwardResponse
}

/**
 * 快速挂机接口
 */
export interface ReqPracticeQuickAward extends Service<'Base'> {
    propId: int
    killedNum: int
}

export interface ResPracticeQuickAward {
    award: AwardResponse
}

/**
 * 怪物刷新
 */
export interface ReqPracticeRefreshMonster extends Service<'Base'> {
    refreshNum: int
}
