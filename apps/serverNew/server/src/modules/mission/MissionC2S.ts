import { Service } from '../../runtime/protocol/ServiceType'
import { AwardResponse } from '../../runtime/protocol/C2S/commom'
import { UserInfoOnlyNetBean } from '../../../generated/protocol/server/C2S/mod/user/UserInfoOnlyNetBean'

/**
 * 获取历练首页信息
 */
export interface ReqMissionGetList extends Service<'Base'> {}

export interface ResMissionGetList {
    /** 历练列表 */
    list: PbMissionInfo[]
}

export interface PbMissionInfo {
    /** 历练场景, 9999表示活动历练 */
    type: int
    bossList: PbMissionBossItem[]
}

export interface PbMissionBossItem {
    /** bossId  */
    id: int
    /** 剩余血量 */
    hp: int
    /** 上次归属 */
    owner?: UserInfoOnlyNetBean
    /** 场内人数 */
    personNum: int
    /** boss死亡时间 */
    dieTime: int
    /** 房间Id */
    roomId: int
}

/**
 * 获取boss数量等详情信息
 */
export interface ReqMissionGetBossList extends Service<'Base'> {
    /** 历练场景, 9999表示活动历练 */
    type: int
}

export interface ResMissionGetBossList {
    list: PbMissionBossItem[]
}

/**
 * 订阅boss复活提醒
 */
export interface ReqMissionSubscribe extends Service<'Base'> {
    /**  历练场景 9999表示活动历练 */
    type: int
    /**  历练地图id */
    bossId: int
    /**  true为订阅，false为取消订阅 */
    subscribe: boolean
}

/**
 * 购买挑战次数
 */
export interface ReqMissionBuyNum extends Service<'Base'> {
    /** 历练场景，9999表示活动历练 */
    type: int
    /** 花费道具类型 */
    costType: int
}

/**
 *  历练更新推送
 */
export interface PushMissionUpdatePush {
    /** 历练类型 */
    type: int
}

/**
 * 当前个人历练新手保护额外奖励领取
 */
export interface ReqMissionAward extends Service<'Base'> {}

export interface ResMissionAward {
    awards: AwardResponse
}
