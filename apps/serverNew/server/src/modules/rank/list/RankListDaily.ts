import { User } from '../../user/bean/User'
import { RankDefine } from '../rules/RankDefine'
import { timestamp } from '@arthropoda/game-engine'
import { UtilTime } from '@arthropoda/game-engine'
import { RankListSystem } from './RankListSystem'
import { RankDaily } from '../daily/RankDaily'
import { RankAccess } from '../persistence/RankAccess'
import { RankRefBase } from '@arthropoda/game-engine'

/**
 * 每日分数排行榜
 */
export class RankListDaily extends RankListSystem {
    protected constructor() {
        super()
    }

    static async _constructor(rankType: string, user: User, params: string[]) {
        const ins = new RankListDaily()
        let suffix = ''
        if (rankType === RankDefine.TYPE_ARENA_TIER_DAILY) {
            // seasonData = Arena.getSvSeasonItem();
            const seasonData = { startTime: timestamp() }
            const now = timestamp()
            if (UtilTime.getDayStartTime(seasonData.startTime) === UtilTime.getDayStartTime(now)) {
                // 赛季第一天
                suffix = UtilTime.formatYMD(now)
            } else {
                suffix = UtilTime.formatYMD(UtilTime.addDays(-1, now))
            }
        } else {
            if (rankType === RankDefine.TYPE_HEART_DEMON && params.includes('real')) {
                suffix = ''
            } else {
                suffix = await RankDaily.getRankKeySuffix(user.sId)
            }
        }
        params = []
        if (suffix) {
            params.push(suffix)
        }
        await ins._constructor(rankType, user, params)
        return ins
    }

    async formatSelf(selfData?: RankRefBase) {
        if (this.params.length == 0 && this.rankType != RankDefine.TYPE_ARENA_TIER_DAILY) {
            selfData = await RankAccess.getRedisRank(this.rankType).getTargetRankInfos(this.selfId)
            this.params = []
        }
        return super.formatSelf(selfData)
    }
}
