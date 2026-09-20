import { Service } from '../../runtime/protocol/ServiceType'
import { AwardResponse } from '../../runtime/protocol/C2S/commom'

/**
 * 加载活动配置
 */
export interface ReqActivityGetConf extends Service<'Base'> {
    /** 要加载的活动列表 */
    confList: PbConfInfo[]
}

interface PbConfInfo {
    /** 活动id */
    id: int
    /** 活动名称 */
    name: string
    /** 验签 */
    salt: string
}

export interface ResActivityGetConf {
    l: PbActivityConf[]
}

interface PbActivityConf {
    /** 活动名称 */
    name: string
    /** 配置内容 */
    content: string
    /** 验签 */
    salt: string
    /** 配置名称 */
    configName: string
    /** 是否覆盖配置全表 */
    configAll: boolean
    /** 活动id */
    id: int
    /** 活动覆盖路径 */
    path: string
}

/**
 * 通用领取档位类活动奖励接口
 */
export interface ReqActivityGearAward extends Service<'Base'> {
    /** 活动名称 */
    activityName: string
    /** 活动档位id */
    id: int
    /** 其他额外字段，比如开疆扩土有两种奖励，需要传标识 */
    ext: string
}
export interface ResActivityGearAward {
    awards: AwardResponse
}

/**
 * 冲榜活动结算状态请求
 */
export interface ReqActivityGetRankSettlement extends Service<'Base'> {}
