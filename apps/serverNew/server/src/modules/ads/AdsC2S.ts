import { AwardResponse } from '../../runtime/protocol/C2S/commom'
import { Service } from '../../runtime/protocol/ServiceType'

/**
 * 单条激励广告对客户端展示的状态
 *
 * 广告状态没有独立的 Mod，客户端拿不到增量下发，
 * 所以这里把展示和判定需要的字段一次性算好返回。
 */
export interface AdsEntry {
    /** 广告id */
    adId: int
    /** 备注 */
    desc: string
    /** 今日已观看次数 */
    num: int
    /** 累计观看次数 */
    totalNum: int
    /** 每日可观看次数上限 */
    times: int
    /** 观看冷却时间(秒) */
    cd: int
    /** 冷却剩余秒数，0 表示可以立即观看 */
    cdRemain: int
    /** 解锁条件是否已满足 */
    unlocked: boolean
}

/**
 * 拉取激励广告列表
 */
export interface ReqAdsList extends Service<'Base'> {}

export interface ResAdsList {
    ads: AdsEntry[]
}

/**
 * 上报一次广告观看完成并领取奖励
 */
export interface ReqAdsWatch extends Service<'Base'> {
    /** 广告id */
    adId: int
}

export interface ResAdsWatch {
    /** 观看后的最新广告状态 */
    ad: AdsEntry
    /** 本次获得的奖励 */
    award: AwardResponse
}
