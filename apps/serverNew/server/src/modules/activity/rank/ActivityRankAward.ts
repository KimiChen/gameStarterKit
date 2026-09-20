import { UtilObject, UtilTime } from '@arthropoda/game-engine'
import { ActionMail } from '../../mail/action/ActionMail'
import { SystemInfoDefine } from '../../serverSettings/runtime/SystemInfoDefine'
import { ActivityErrors } from '../ActivityErrors'
import { RankAwardItemBean } from '../bean/RankAwardItemBean'
import { ActivitySchedule } from '../scheduling/ActivitySchedule'
import { ActivityRankDefine } from '../rules/ActivityRankDefine'
import { ActivityRank } from './ActivityRank'

/**
 * 领奖、补发奖励
 */
export class ActivityRankAward {
    activityOpenInfo: ActivitySchedule

    activityRankConf: IConfActivity_rank | IConfActivity_cross_mission

    private selfMailId: int = 0

    private crossMailId: int = SystemInfoDefine.ActivityRankCrossAward_67

    constructor(info: ActivitySchedule, conf: IConfActivity_rank | IConfActivity_cross_mission) {
        this.activityOpenInfo = info
        this.activityRankConf = conf
    }

    /**
     * 获取排名奖励
     * @param confs
     * @param rank
     * @returns
     */
    private getAwardConfByRank<T extends { rank: any }>(confs: T[], rank: int) {
        for (const confItem of confs) {
            if (rank < confItem.rank[0]) {
                return null
            }
            if (rank <= confItem.rank[1]) {
                return confItem
            }
        }
        return null
    }

    /**
     * 补发个人奖励
     * @param list <rank,[uId,item]>
     */
    sendSelfAward(list: Map<int, Map<int, RankAwardItemBean>>) {
        const config = this.activityRankConf.rank.arrayValues()

        for (const [rank, itemList] of list) {
            const awardsConf = this.getAwardConfByRank(config, rank)
            if (awardsConf == null) {
                continue
            }
            for (const [uId, item] of itemList) {
                let awards
                if (item.type === ActivityRankDefine.AWARD_TYPE_GUILD_LEADER) {
                    awards = awardsConf.award2
                } else {
                    awards = awardsConf.award1
                }
                item.state = ActivityRankDefine.AWARD_ALREADY_GET

                //邮件
                ActionMail.add(
                    uId,
                    this.selfMailId,
                    {
                        [SystemInfoDefine.PARAM_ACTIVITY_NAME]: this.activityOpenInfo.name,
                        [SystemInfoDefine.PARAM_DEFAULT]: rank,
                    },
                    awards,
                )

                //TODO 数数
            }
        }
    }

    /**
     * 补发跨服奖励
     * @param <uId,item>
     */
    sendCrossAward(list: Map<int, RankAwardItemBean>) {
        if (!UtilObject.hasOwnProp(this.activityRankConf, 'crossRank')) {
            return
        }

        const rankCof = this.activityRankConf as IConfActivity_cross_mission
        const crossRankAwards: Map<int, any> = new Map()

        for (const [uId, item] of list) {
            if (!crossRankAwards.has(item.rank)) {
                const awardsConf = rankCof.crossRank.arrayValues()
                const awardRankConf = this.getAwardConfByRank(awardsConf, item.rank)
                crossRankAwards.set(item.rank, awardRankConf ? awardRankConf.crossRankAward : [])
            }
            if (!crossRankAwards.has(item.rank)) {
                //邮件
                ActionMail.add(
                    uId,
                    this.crossMailId,
                    {
                        [SystemInfoDefine.PARAM_ACTIVITY_NAME]: this.activityOpenInfo.name,
                        [SystemInfoDefine.PARAM_DEFAULT]: item.rank,
                    },
                    crossRankAwards.get(item.rank),
                )

                item.rank = ActivityRankDefine.AWARD_ALREADY_GET
            }
        }
    }

    /**
     * 设置数据过期时间
     */
    async setExpire() {
        await ActivityRank.setAwardExpireTime(this.activityOpenInfo)

        const rootKey = ActivityRank.getRootKey(this.activityOpenInfo)
        const redisRank = ActivityRank.getRedisRankByRootKey(rootKey, this.activityOpenInfo.cross_id)
        await redisRank.expire(UtilTime.DAY_SECOND * ActivityRankDefine.RANK_SAVE_DAY)

        if (this.activityOpenInfo.cross_id) {
            const crossRedisRank = ActivityRank.getRedisRank(this.activityOpenInfo, ['server'])
            await crossRedisRank.expire(UtilTime.DAY_SECOND * ActivityRankDefine.RANK_SAVE_DAY)
        }
    }

    /**
     * 主动领奖时获取冲榜奖励
     * @param item
     * @returns
     */
    gearSelfAward(item: RankAwardItemBean) {
        const awardConf = this.activityRankConf.rank.arrayValues()
        const conf = this.getAwardConfByRank(awardConf, item.rank)
        // 联盟冲榜成员只有额外奖励
        let awards
        if (item.type === ActivityRankDefine.AWARD_TYPE_GUILD_LEADER) {
            awards = conf?.award2 // 盟主
        } else {
            awards = conf?.award1 // 个人或者成员
        }
        return awards
    }

    /**
     * 主动领奖时获取跨服奖励
     * @param item
     * @returns
     */
    gearCrossAward(item: RankAwardItemBean) {
        const awardConf = (this.activityRankConf as IConfActivity_cross_mission).crossRank.arrayValues()
        const conf = this.getAwardConfByRank(awardConf, item.rank)
        if (!conf) {
            throw ActivityErrors.ActivityCanNotAward
        }
        return conf.crossRankAward
    }

    /**
     * 补发奖励入口
     * @param ActivityOpenInfo                          activityOpenInfo
     * @param ActivityRankConf|ActivityCrossMissionConf activityConfig
     */
    static async reissue(
        activityOpenInfo: ActivitySchedule,
        activityConfig: IConfActivity_rank | IConfActivity_cross_mission,
    ) {
        const obj = new ActivityRankAward(activityOpenInfo, activityConfig)

        // 获取定榜
        const cache = await ActivityRank.loadAllAwardCache(activityOpenInfo)
        if (!cache) {
            // 无人上榜
            return
        }

        // 选择邮件模板
        obj.selfMailId = SystemInfoDefine.ACTIVITY_RANK_AWARD_54

        const selfRankCache: Map<int, Map<int, any>> = new Map()
        const crossRankCache: Map<int, any> = new Map()

        for (const [, item] of cache) {
            // if (activityOpenInfo.cross_id && SysConst.getServerIdByUid(item.id) != PLATFORM_SERVER_ID) {
            //     // TODO:判断跨服冲榜是不是本服玩家
            //     continue;
            // }
            for (const [, awardInfo] of item.awardInfos) {
                if (awardInfo.state != ActivityRankDefine.AWARD_CAN_GET) {
                    // 已经领奖的玩家或者未上榜玩家直接跳过
                    continue
                }
                if (awardInfo.type == ActivityRankDefine.AWARD_TYPE_SERVER) {
                    crossRankCache.set(item.uId, awardInfo)
                } else {
                    if (!selfRankCache.has(awardInfo.rank)) {
                        selfRankCache.set(awardInfo.rank, new Map())
                    }
                    selfRankCache.get(awardInfo.rank)!.set(item.uId, awardInfo)
                }
            }
        }

        obj.sendSelfAward(selfRankCache)
        if (crossRankCache) {
            obj.sendCrossAward(crossRankCache)
        }
        await obj.setExpire()
    }
}
