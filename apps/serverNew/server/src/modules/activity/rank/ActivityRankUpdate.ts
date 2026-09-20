import { User } from '../../user/bean/User'
import { ActivityRankDefine } from '../rules/ActivityRankDefine'
import { DiffRank } from '@arthropoda/game-engine'
import { ActivitySchedule } from '../scheduling/ActivitySchedule'
import { ActivityScheduleResolver } from '../scheduling/ActivityScheduleResolver'
import { ActivityRank } from './ActivityRank'

/**
 * 冲榜活动
 */
export class ActivityRankUpdate {
    private activityName: string = ''

    private activityOpenInfo: ActivitySchedule

    private user: User

    private redisRank: DiffRank

    private rootKey: string = ''

    private serverChangeScore: int = 0

    constructor(user: User, activity: ActivitySchedule) {
        this.user = user
        this.activityOpenInfo = activity
        this.activityName = activity.name
        this.rootKey = ActivityRank.getRootKey(this.activityOpenInfo)
        this.redisRank = ActivityRank.getRedisRankByRootKey(this.rootKey, this.activityOpenInfo.cross_id)
    }

    public getRank() {
        return this.redisRank
    }

    async updateServerScore() {
        const sId = this.user.sId
        const rankExtParams = ['server']
        await ActivityRank.getRedisRank(this.activityOpenInfo, rankExtParams).incr(sId, this.serverChangeScore)
    }

    /**
     * 更新个人榜单
     * @param num
     * @returns
     */
    async updateSelfScore(num: int) {
        //判断配置是否为涨幅类型
        //rankNumType int 冲榜专用-数值类型（1-当前值/2-涨幅值）
        const rankNumType = C.rank(this.activityName).dataType ?? ActivityRankDefine.NUM_TYPE_NOW
        if (rankNumType === ActivityRankDefine.NUM_TYPE_NOW) {
            // 总量
            await this.redisRank.set(this.user.id, num)
            this.serverChangeScore = num
            return
        }

        // 涨幅
        if (num !== 0) {
            const score = await this.redisRank.incr(this.user.id, num)
            this.serverChangeScore = num
        }
    }

    /**
     * 冲榜入榜(new)num为增量或者总量
     * 需要历史最高，且是涨幅，传入num为当前值
     * 不需要历史最高，只有涨幅，num为涨幅
     * @param user: UserBase
     * @param activityNames: string[]
     * @param num: int
     */
    static async run(user: User, activityNames: string[], num: int) {
        for (const activityName of activityNames) {
            const isFrobid = await ActivityRank.checkIsForbid(user.id)
            if (isFrobid) {
                continue
            }
            const activityOpenInfo = await ActivityScheduleResolver.getOpen(user.sId, activityName, user)
            if (activityOpenInfo == null || !activityOpenInfo.checkCanSave()) {
                continue
            }
            const opt = new ActivityRankUpdate(user, activityOpenInfo)
            if (!opt.getRank()) {
                continue
            }
            // 更新个人榜
            await opt.updateSelfScore(num)
            if (opt.serverChangeScore != 0 && opt.activityOpenInfo.cross_id > 0) {
                // 更新区服榜单
                await opt.updateServerScore()
            }
        }
    }
}
