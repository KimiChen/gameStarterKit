import { DiffRank } from '@arthropoda/game-engine'
import { UtilObject } from '@arthropoda/game-engine'
import { UtilTime } from '@arthropoda/game-engine'
import { RankAwardItemBean } from '../bean/RankAwardItemBean'
import { Guild } from '../../guild/bean/Guild'
import { GuildRef } from '../../guild/ref/GuildRef'
import { ActivityRankDefine } from '../rules/ActivityRankDefine'
import { ActivitySchedule } from '../scheduling/ActivitySchedule'
import { ActivityRank } from './ActivityRank'

/**
 * 定榜操作类
 *
 * 旧二进制通道的变更推送（`Activity` / `ActivityRank` Bean mod 推送）已随 P6 删除。
 * 定榜只负责把奖励写进奖励缓存与定榜数据；客户端可见的结算通知需按 shared 声明的
 * 领域推送由拥有该 shared 路由的服务显式发送。
 * ⛔ 不要在此处恢复框架级隐式推送。
 */
export class ActivityRankFinalize {
    /** 活动信息  */
    activityOpenInfo: ActivitySchedule

    /** 活动配置 */
    activityRankConf: IConfActivity_rank | IConfActivity_cross_mission

    /** 最大排名 */
    maxRank: int = 0

    rootKeys: string[] = []

    /** 跨服冲榜本服是否有奖励 */
    private hasCrossAward = false

    /** 跨服排行榜本服所处的排名 */
    private crossRank = 0

    constructor(info: ActivitySchedule, conf: IConfActivity_rank | IConfActivity_cross_mission) {
        this.activityOpenInfo = info
        this.activityRankConf = conf
    }

    //#region 奖励发放

    /**
     * 联盟奖励
     * @param rootKey
     */
    async guild(rootKey: string) {
        const redisRank = ActivityRank.getRedisRankByRootKey(rootKey, this.activityOpenInfo.cross_id)
        const gIds = await redisRank.getRankIdScores(0, this.maxRank)

        let rank = 0
        for (const { value } of gIds) {
            rank++
            const guild = await Guild.load(value)
            if (!guild) {
                continue
            }
            for (const [, member] of guild.members) {
                const cache = ActivityRank.newAwardCache(this.activityOpenInfo, member.uId)
                cache.uId = member.uId
                cache.rank = rank

                let awardType
                if (guild.leaderId == member.uId) {
                    // 盟主奖励
                    awardType = ActivityRankDefine.AWARD_TYPE_GUILD_LEADER
                } else {
                    awardType = ActivityRankDefine.AWARD_TYPE_NORMAL
                }
                cache.awardInfos.set(
                    awardType,
                    new RankAwardItemBean({
                        type: awardType,
                        state: ActivityRankDefine.AWARD_CAN_GET,
                        rank: rank,
                    }),
                )

                // 跨服区服奖励
                if (this.hasCrossAward) {
                    cache.awardInfos.set(
                        ActivityRankDefine.AWARD_TYPE_SERVER,
                        new RankAwardItemBean({
                            type: ActivityRankDefine.AWARD_TYPE_SERVER,
                            state: ActivityRankDefine.AWARD_CAN_GET,
                            rank: this.crossRank,
                        }),
                    )
                }

                // 数数日志
            }

            // 定榜操作
            await this.guildRankConfirm(redisRank)

            // 无联盟排名奖励，但有区服奖励可以领取
            if (this.hasCrossAward) {
                await this.crossGuild(redisRank, this.maxRank)
            }
        }
    }

    /**
     * 发送拥有排行榜奖励的个人奖励
     * @param rootKey
     * @returns
     */
    async self(rootKey: string) {
        const redisRank = ActivityRank.getRedisRankByRootKey(rootKey, this.activityOpenInfo.cross_id)
        const uIds = await redisRank.getRankIdScores(0, this.maxRank)

        let rank = 0
        for (const { value } of uIds) {
            const uId = value as int
            rank++

            const cache = ActivityRank.newAwardCache(this.activityOpenInfo, uId)
            cache.uId = uId
            cache.rank = rank

            // 个人奖励
            cache.awardInfos.set(
                ActivityRankDefine.AWARD_TYPE_NORMAL,
                new RankAwardItemBean({
                    type: ActivityRankDefine.AWARD_TYPE_NORMAL,
                    state: ActivityRankDefine.AWARD_CAN_GET,
                    rank: rank,
                }),
            )

            // 跨服区服奖励
            if (this.hasCrossAward) {
                cache.awardInfos.set(
                    ActivityRankDefine.AWARD_TYPE_SERVER,
                    new RankAwardItemBean({
                        type: ActivityRankDefine.AWARD_TYPE_SERVER,
                        state: ActivityRankDefine.AWARD_CAN_GET,
                        rank: this.crossRank,
                    }),
                )
            }
        }

        if (!this.maxRank) {
            return
        }

        if (this.hasCrossAward) {
            await this.crossSelf(redisRank, this.maxRank)
        }
    }

    /**
     * 跨服联盟奖励
     * @param redisRank
     * @param start
     * @param length
     * @returns
     */
    async crossGuild(redisRank: DiffRank, start: int, length = 1000) {
        const ids2 = await redisRank.getRankIds(start, length)
        if (ids2.length == 0) {
            return
        }
        for (const gId of ids2) {
            const guild = await Guild.load(gId)
            if (!guild) {
                continue
            }
            if (guild.members.size() <= 0) {
                continue
            }
            for (const [, member] of guild.members) {
                const cache = ActivityRank.newAwardCache(this.activityOpenInfo, member.uId)
                cache.uId = member.uId
                cache.rank = this.crossRank

                // 跨服区服奖励
                cache.awardInfos.set(
                    ActivityRankDefine.AWARD_TYPE_SERVER,
                    new RankAwardItemBean({
                        type: ActivityRankDefine.AWARD_TYPE_SERVER,
                        state: ActivityRankDefine.AWARD_CAN_GET,
                        rank: this.crossRank,
                    }),
                )
            }
        }
        start += length
        await this.crossGuild(redisRank, start, length)
    }

    /**
     * 跨服个人奖励
     * @param redisRank
     * @param start
     * @param length
     * @returns
     */
    async crossSelf(redisRank: DiffRank, start: int, length: int = 1000) {
        const ids2 = await redisRank.getRankIds(start, length)
        if (ids2.length == 0) {
            return
        }
        for (const id of ids2) {
            const uId = id as int
            const cache = ActivityRank.newAwardCache(this.activityOpenInfo, uId)
            cache.uId = uId
            cache.rank = this.crossRank

            // 跨服区服奖励
            cache.awardInfos.set(
                ActivityRankDefine.AWARD_TYPE_SERVER,
                new RankAwardItemBean({
                    type: ActivityRankDefine.AWARD_TYPE_SERVER,
                    state: ActivityRankDefine.AWARD_CAN_GET,
                    rank: this.crossRank,
                }),
            )
        }
        start += length
        await this.crossSelf(redisRank, start, length)
    }

    //#endregion

    //#region 定榜流程

    /**
     * 开始执行定榜业务
     * @param activityOpenInfo
     * @param activityRankConf
     */
    static async run(
        activityOpenInfo: ActivitySchedule,
        activityRankConf: IConfActivity_rank | IConfActivity_cross_mission,
    ) {
        Log.info(`[${activityOpenInfo.sId}区]冲榜活动执行定榜逻辑` + JSON.stringify(activityOpenInfo))

        // 获取最大的排名
        const maxRank = activityRankConf.rank.end().rank[1]
        if (!maxRank) {
            throw Error('冲榜活动配置异常:' + JSON.stringify(activityRankConf))
        }

        const opt = new ActivityRankFinalize(activityOpenInfo, activityRankConf)
        opt.maxRank = maxRank
        opt.rootKeys = [ActivityRank.getRootKey(activityOpenInfo), ActivityRank.getAwardRootKey(activityOpenInfo), '0']

        // 跨服
        if (activityOpenInfo.cross_id && UtilObject.hasOwnProp(activityRankConf, 'crossRank')) {
            activityRankConf = activityRankConf as IConfActivity_cross_mission
            const crossRank = await ActivityRank.getRedisRank(activityOpenInfo, ['server']).getTargetRank(
                activityOpenInfo.sId,
            )
            const crossMaxRank = activityRankConf.crossRank.end().rank[1]
            if (crossRank <= crossMaxRank) {
                opt.crossRank = crossRank
                opt.hasCrossAward = true
            }
        }

        for (const key of opt.rootKeys) {
            await opt.self(key)
            // 榜单结算是否完成
            ActivityRank.newAwardCache(activityOpenInfo, 0)
        }
    }

    /**
     * 联盟定榜操作
     * @param redisRank
     */
    async guildRankConfirm(redisRank: DiffRank) {
        const key = redisRank.key + '_user_confirm'
        // if (!Rank.isGuildRank(key)) {
        //     return
        // }
        const redis = redisRank.getRedis()
        const guildIds = await redisRank.getRankIds(0, 0)
        const guilds = await GuildRef.loadAll(guildIds)
        const multi = redis.client().multi()
        try {
            for (const guildId of guildIds) {
                const guild = guilds.get(guildId)
                if (!guild || !guild.members) {
                    continue
                }
                for (const [, member] of guild.members) {
                    multi.hSet(key, member.uId, guildId)
                }
            }
        } finally {
            await multi.exec()
        }
        await redis.expire(key, UtilTime.DAY_SECOND * ActivityRankDefine.RANK_SAVE_DAY)
    }

    //#endregion
}
