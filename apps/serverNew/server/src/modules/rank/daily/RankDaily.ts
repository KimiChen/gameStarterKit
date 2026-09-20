import moment from 'moment'
import { RankDefine } from '../rules/RankDefine'
import { timestamp } from '@arthropoda/game-engine'
import { RankAccess } from '../persistence/RankAccess'
import { RankDailyBean } from '../bean/RankDailyBean'
import { PbRankDailyInfo } from '../RankC2S'
import { RankGuildRef } from '../ref/RankGuildRef'
import { UserBaseRef } from '../../user/ref/UserBaseRef'
import { UserProfileFormatter } from '../../user/action/UserProfileFormatter'
import { UtilTime } from '@arthropoda/game-engine'
import { ServerAvailabilityRules } from '../../serverSettings/runtime/ServerAvailabilityRules'

export class RankDaily {
    /**
     * 过天重置单个榜单
     * @param rankType
     * @param maxNum
     * @returns
     */
    static async resetRankItem(rankType: string, sId: int, maxNum = 100) {
        if (RankDefine.TYPE_ARENA_TIER_DAILY === rankType) {
            return
        }
        const needInfo = RankDefine.CONF.get(rankType)?.subInfo ?? false

        const realDiffRank = RankAccess.getRedisRank(rankType, sId)

        const redis = realDiffRank.getRedis()
        const list = await realDiffRank.getRankIdScores(0, maxNum)

        const datas = []
        const memberIds = []
        for (const { score, value } of list) {
            datas.push({ score: score, value: value.toString() })
            memberIds.push(value)
        }

        let infos
        if (needInfo) {
            const realInfoKey = RankAccess.formatRankInfoKey(rankType)
            infos = await redis.hmGet(realInfoKey, memberIds)
        }

        const now = timestamp()
        const today = UtilTime.formatYMD(now)

        const todayKey = RankAccess.formatRankKey(rankType, sId, today)
        const todayInfoKey = RankAccess.formatRankInfoKey(rankType, sId, today)
        if (await redis.exists(todayKey)) {
            const backKey = todayKey + ':back:' + UtilTime.formatYmdHis(now)
            await redis.rename(todayKey, backKey)
            await redis.expire(backKey, UtilTime.DAY_SECOND)
        }

        await redis.zAddMembers(todayKey, datas)
        await redis.expireAt(todayKey, UtilTime.addDays(2, now))

        if (infos) {
            await redis.hMset(todayInfoKey, infos as any)
            await redis.expireAt(todayInfoKey, UtilTime.addDays(2, now))
        }
    }

    /**
     * 过天重置每日榜单
     */
    static async reset(sId: int) {
        const maxNum = 100
        for (const [type, list] of RankDefine.RankMapGroup) {
            const rankTypes = []

            // 重置该组下的所有榜单
            for (const [rankType] of list) {
                try {
                    await this.resetRankItem(rankType, sId, maxNum)
                    rankTypes.push(rankType)
                } catch (e) {
                    Log.error('RankDailyResetFail' + e, [rankType, maxNum])
                    if (PLATFORM == 'bearjoy') {
                        throw e
                    }
                }
            }

            // 打乱该组下的所有榜单，用于生成该组随机显示其中一个榜单的第一名
            // shuffle(rankTypes);

            // 汇总榜生成子榜第一名数据
            for (const rankType of rankTypes) {
                if (await this.tryMakeDailyInfo(type, rankType, sId)) {
                    // 生成一个即可
                    break
                }
            }
        }
    }

    /**
     * 尝试生成汇总榜的第一名数据
     * @param type
     * @param rankType
     * @returns
     */
    static async tryMakeDailyInfo(type: int, rankType: string, sId: int) {
        // 记录所在时间
        const today = UtilTime.formatYMD()

        let suffix
        // 竞技场排行榜需要取昨日榜单，赛季第一天接口会实时取当天数据
        if (rankType === RankDefine.TYPE_ARENA_TIER_DAILY) {
            suffix = UtilTime.formatYMD(UtilTime.addDays(-1, timestamp()))
        } else {
            suffix = today
        }

        const dailyInfo = new RankDailyBean(type, today)
        dailyInfo.rankId = type
        dailyInfo.rankType = rankType

        const diffRank = RankAccess.getRedisRank(rankType, sId, suffix)
        const list = await RankAccess.getRedisRank(rankType, sId, suffix).getRankIdScores(0, 1)
        if (!list) {
            return false
        }
        for (const { score, value } of list) {
            dailyInfo.memberId = value.toString()
            dailyInfo.score = score
            if (!RankDefine.CONF.get(rankType)?.subInfo) {
                const infoKey = RankAccess.formatRankInfoKey(rankType, sId, suffix)
                dailyInfo.itemId = (await diffRank.getRedis().hGet(infoKey, dailyInfo.memberId)) ?? ''
            }
            break
        }
        return true
    }

    static async getDailyInfoPb(sId: int, type: int, rankType: string) {
        const pbItem: PbRankDailyInfo = {
            id: type,
            rankType: rankType,
            memberId: '',
            itemId: '',
            rank: 0,
            score: 0,
            userInfo: undefined,
        }
        const today = await this.getRankKeySuffix(sId)
        const diffRank = today ? RankAccess.getRedisRank(rankType, sId, today) : RankAccess.getRedisRank(rankType)
        const list = await RankAccess.getRedisRank(rankType, sId, today).getRankInfos(0, 1)
        if (!list) {
            return null
        }
        for (const [id, refBase] of list) {
            pbItem.memberId = id.toString()
            pbItem.score = refBase.score
            if (RankDefine.CONF.get(rankType)?.subInfo) {
                const infoKey = RankAccess.formatRankInfoKey(rankType, sId, today)
                const itemId = (await diffRank.getRedis().hGet(infoKey, id.toString())) as string
                pbItem.itemId = itemId
            }
            let uId
            if (refBase instanceof RankGuildRef) {
                uId = refBase.leaderId
                // pbItem.setGuildInfo(UtilProtobuf.pbFromObject(refBase, CommonGuildInfo.class))
            } else {
                uId = id
            }
            const user = await UserBaseRef.load(uId)
            if (user) {
                pbItem.userInfo = UserProfileFormatter.format(user).toModData() as any
            }
            break
        }
        return pbItem
    }

    static async getRankKeySuffix(sId: int) {
        const svOpenTime = await ServerAvailabilityRules.getOnlySvOpenTime(sId)
        const now = timestamp()
        if (svOpenTime > 0) {
            const firstDay = moment.unix(svOpenTime).add(1, 'day').set('hour', 5).set('minute', 0).unix()
            if (firstDay > now) {
                return ''
            }
        }
        if (moment.unix(now).hour() < 5) {
            return moment.unix(now).subtract(1, 'day').format('Ymd')
        }
        return moment.unix(now).format('Ymd')
    }
}
