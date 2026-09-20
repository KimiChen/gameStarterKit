import { DiffRank, RankRefBase, UtilTime, timestamp } from '@arthropoda/game-engine'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { User } from '../../user/bean/User'
import { RankErrors } from '../RankErrors'
import { RankDefine } from '../rules/RankDefine'

export class RankAccess {
    // 排行榜默认时间
    static readonly DEFAULT_RANK_TIME = 10

    // 前端过期时间
    static readonly FRONT_EXPIRE_TIME = 10

    // 商战排行榜过期时间
    static readonly FRONT_EXPIRE_TRADE = 10

    // 在排行榜页面，榜单刷新的时间
    static readonly REFRESH_TIME = 10

    // 玩家和配置（NPC等）ID的界限，超过这个界限即认定为玩家
    static readonly USER_CONF_BOUNDARY = 100000

    // 可膜拜的排行榜类型
    static readonly WORSHIP_RANK_TYPE: string[] = []

    /**
     * 获取DiffRank操作类
     * @param string rankType
     * @param mixed  ...params
     * @return DiffRank
     */
    static getRedisRank(rankType: string, sId?: int, ...params: string[]) {
        const rankConf = RankDefine.CONF.get(rankType)
        if (!rankConf) {
            throw RankErrors.RankNoFount
        }
        const rankRef = rankConf.rankRef ?? RankRefBase
        const key = this.formatRankKey(rankType, sId, ...params)
        return DiffRank.load(rankRef, key, rankConf.isCenter ?? false)
    }

    static formatRankKey(rankType: string, sId?: int, ...params: string[]): string {
        const rankConf = RankDefine.CONF.get(rankType)
        if (!rankConf) {
            throw RankErrors.RankNoFount
        }
        let key
        const isCenter = rankConf.isCenter ?? false
        if (isCenter) {
            key = 'CenterRank:'
        } else {
            key = 'Rank:'
        }
        key += rankType
        if (params.length > 0) {
            key += ':' + params.join(':')
        }
        if (!isCenter && sId) {
            return `${sId}:${key}`
        }
        return key
    }

    static formatRankInfoKey(rankType: string, sId?: int, ...params: string[]): string {
        const rankConf = RankDefine.CONF.get(rankType)
        if (!rankConf) {
            throw RankErrors.RankNoFount
        }
        const isCenter = rankConf.isCenter ?? false
        let key = 'RankSubInfo:'
        key += rankType
        if (params.length > 0) {
            key += ':' + params.join(':')
        }
        if (!isCenter && sId) {
            return `${sId}:${key}`
        }
        return key
    }

    //#region 膜拜

    /**
     * 膜拜类型
     * @param rankKey
     * @returns
     */
    public static getWorshipRankType(rankKey: string): [string, string] {
        const rankType = rankKey
        const worshipRankType = rankType
        return [rankType, worshipRankType]
    }

    /**
     * 检测排行榜是否可以膜拜
     * @param user
     * @param rankKey
     * @param isThrow
     * @returns
     */
    static checkCanWorship(user: User, rankKey: string, isThrow = false) {
        const [rankType, worshipRankType] = this.getWorshipRankType(rankKey)
        if (!RankAccess.WORSHIP_RANK_TYPE.includes(rankType)) {
            // 不是膜拜榜
            if (isThrow) {
                throw SystemErrors.SysParamErr
            }
            return false
        }
        if (user.worshipRankTypes.has(worshipRankType)) {
            const now = timestamp()
            const expireTime = user.worshipRankTypes.get(worshipRankType)!
            if (expireTime >= now) {
                // 已膜拜
                if (isThrow) {
                    throw RankErrors.RankAlreadyWorship
                }
                return false
            }
        }
        return true
    }

    /**
     * 设置膜拜信息
     * @param user
     * @param rankKey
     */
    public static setWorship(user: User, rankKey: string) {
        // 检测是否可以膜拜
        this.checkCanWorship(user, rankKey, true)
        const [, worshipRankType] = this.getWorshipRankType(rankKey)
        // 明天零点,过期时间
        const expireTime = UtilTime.getDayStartTime() + UtilTime.DAY_SECOND
        // 设置膜拜过期时间
        user.worshipRankTypes.set(worshipRankType, expireTime)
    }
    //#endregion
}
