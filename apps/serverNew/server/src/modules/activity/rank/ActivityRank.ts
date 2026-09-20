import { RedisInstance } from '@arthropoda/game-engine'
import { DiffRank } from '@arthropoda/game-engine'
import { RankRefBase } from '@arthropoda/game-engine'
import { UtilTime } from '@arthropoda/game-engine'
import { Activity } from '../bean/Activity'
import { ActivityRankItemBean } from '../bean/ActivityRankItemBean'
import { RankAwardBean } from '../bean/RankAwardBean'
import { ActivityRankDefine } from '../rules/ActivityRankDefine'
import { ActivitySchedule } from '../scheduling/ActivitySchedule'

/**
 * 冲榜活动
 */
export class ActivityRank {
    /**
     * 检查玩家是否榜单禁用
     * @param uId
     */
    static async checkIsForbid(uId: int) {
        const redis = RedisInstance.getServerRedis()
        const uIds = await redis.get(ActivityRankDefine.FORBID_RANK_USER)
        if (uIds && uIds.includes(uId.toString())) {
            return true
        }
        return false
    }

    /**
     * 活动的唯一的关键key榜单
     * 本服榜单规则：
     *  Activity:ActivityName:MemberType:Param1:Param2:StartDate:ServerId
     * 跨服榜单规则：
     *  Activity:sId:ActivityName:MemberType:Param1:Param2:CrossId
     * @param   activityOpenInfo
     * @param   params
     * @return actName_startDate
     */
    static getRootKey(activityOpenInfo: ActivitySchedule, ...params: string[]): string {
        let key = `Activity:${activityOpenInfo.name}`
        if (params.length > 0) {
            key += ':' + params.join(':')
        }
        if (activityOpenInfo.cross_id > 0) {
            key += `:${activityOpenInfo.cross_id}`
        } else {
            key += `:${activityOpenInfo.startDate}:${activityOpenInfo.sId}`
        }
        return key
    }

    /**
     * 冲榜活动领奖的唯一的关键key
     * 本服规则：
     *  RankActivityAward:activityName:param1:param2:startDate:ServerId
     * 跨服规则：
     *  RankActivityAward:activityName:param1:param2:crossId
     * @param ActivityOpenInfo activityOpenInfo
     * @param             ...params
     * @return string
     */
    static getAwardRootKey(activityOpenInfo: ActivitySchedule, ...params: string[]): string {
        let key = activityOpenInfo.name
        if (params.length > 0) {
            key += ':' + params.join(':')
        }
        if (activityOpenInfo.cross_id > 0) {
            key += `:${activityOpenInfo.cross_id}`
        } else {
            key += `:${activityOpenInfo.startDate}:${activityOpenInfo.sId}`
        }
        return key
    }

    /**
     * 根据活动获取排行榜操作类
     * @param ActivityOpenInfo activityOpenInfo
     * @param array            extParams
     * @param string           ref
     * @return DiffRank
     */
    static getRedisRank(
        activityOpenInfo: ActivitySchedule,
        extParams: string[] = [],
        ref: typeof RankRefBase = RankRefBase,
    ) {
        const rootKey = this.getRootKey(activityOpenInfo, ...extParams)
        return DiffRank.load(ref, `Rank:${rootKey}`, activityOpenInfo.cross_id > 0)
    }

    /**
     * 根据活动获取排行榜操作类
     * @param rootKey
     * @param ref
     * @returns
     */
    static getRedisRankByRootKey(rootKey: string, crossId: int = 0, ref: typeof RankRefBase = RankRefBase): DiffRank {
        return DiffRank.load(ref, `Rank:${rootKey}`, crossId > 0)
    }

    /**
     * 创建活动数据类
     * @param activityOpenInfo
     * @param uId
     * @param params
     * @returns
     */
    static newAwardCache(activityOpenInfo: ActivitySchedule, uId: int, ...params: string[]) {
        const rootKey = this.getAwardRootKey(activityOpenInfo, ...params)
        const cache = new RankAwardBean(uId, rootKey)
        cache.uId = uId
        return cache
    }

    /**
     * 创建活动数据类
     * @param awardKey
     * @param uId
     * @param crossId
     * @returns
     */
    static newAwardCacheByRootKey(awardKey: string, uId: int) {
        return new RankAwardBean(uId, awardKey)
    }

    /**
     * 获取活动数据
     * @param activityOpenInfo
     * @returns
     */
    static async loadAllAwardCache(activityOpenInfo: ActivitySchedule) {
        const rootKey = this.getAwardRootKey(activityOpenInfo)
        return RankAwardBean.loadAll(rootKey)
    }

    /**
     * 获取玩家活动数据
     * @param                  uId
     * @param ActivityOpenInfo activityOpenInfo
     * @return DiffHJson|RankAwardCache|RankAwardCrossCache|null
     */
    static loadUserAwardCache(uId: int, activityOpenInfo: ActivitySchedule) {
        const rootKey = this.getAwardRootKey(activityOpenInfo)
        return RankAwardBean.load(uId, rootKey)
    }

    /**
     * 设置活动数据过期时间
     * @param ActivityOpenInfo activityOpenInfo
     */
    static async setAwardExpireTime(activityOpenInfo: ActivitySchedule) {
        const rootKey = this.getAwardRootKey(activityOpenInfo)
        await RedisInstance.getServerRedis().expire(rootKey, UtilTime.DAY_SECOND * 30)
    }

    /**
     * 冲榜数据change
     * @param uId  change接受者
     * @param activityName
     * @param data
     * @returns
     */
    static setRankInfoChange(uId: int, activityName: string, data: Partial<ActivityRankItemBean>) {
        const mod = new Activity(uId)
        const modRank = new ActivityRankItemBean()
        mod.activityRankInfo.buildNet([[activityName, modRank]])
        // 将 data 数据传递给 modRank 实例
        Object.assign(modRank, data)
        return mod
    }
}
