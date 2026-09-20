import { User } from '../../user/bean/User'
import { Guild } from '../../guild/bean/Guild'
import { RankDailyBean } from '../bean/RankDailyBean'
import { RankGuildRef } from '../ref/RankGuildRef'
import { RankDefine } from '../rules/RankDefine'
import { timestamp } from '@arthropoda/game-engine'
import { PbRankDailyInfo, ReqRankGetDailyInfo, ResRankGetDailyInfo } from '../RankC2S'
import { UtilTime } from '@arthropoda/game-engine'
import { UserProfileFormatter } from '../../user/action/UserProfileFormatter'
import { RankAccess } from '../persistence/RankAccess'
import { RankDaily } from '../daily/RankDaily'
import { GameAction } from '../../../runtime/action/GameAction'
import { ServerAvailabilityRules } from '../../serverSettings/runtime/ServerAvailabilityRules'

/**
 * 总排行榜大入口
 */
export class ActionRankGetDailyInfo extends GameAction {
    async doAction(req: ReqRankGetDailyInfo, res: ResRankGetDailyInfo) {
        const svOpenTime = await ServerAvailabilityRules.getOnlySvOpenTime(this.user.sId)
        if (svOpenTime > 0 && UtilTime.getDayStartTime(svOpenTime) == UtilTime.getDayStartTime(timestamp())) {
            res.info = await firstDay(this.user.sId)
        } else {
            res.info = await otherDay(this.user.sId)
        }
    }
}

/**
 * 开服第一天取实时数据
 * @param sId
 * @returns
 */
async function firstDay(sId: int) {
    const resp: PbRankDailyInfo[] = []
    for (const [type, rankTypes] of RankDefine.RankMapGroup) {
        for (const [rankType, rankId] of rankTypes) {
            const pb = await RankDaily.getDailyInfoPb(sId, type, rankType)
            if (pb) {
                resp.push(pb)
                break
            }
        }
    }
    return resp
}

/**
 * otherDay
 * 其他天数取缓存数据
 * @access
 * @return array
 */
async function otherDay(sId: int) {
    const redisKey = UtilTime.formatYMD(timestamp() - UtilTime.HOUR_SECOND * 5)
    const list = await RankDailyBean.loadAll(redisKey, { serverId: sId })
    const resp: PbRankDailyInfo[] = []
    for (const [, item] of list) {
        let pbMemberId = item.memberId
        let pbScore = item.score
        /** @var RankGetDailyInfoResponse_DailyInfo pbItem */
        const pbItem: PbRankDailyInfo = {
            id: item.rankId,
            rankType: item.rankType,
            memberId: item.memberId,
            itemId: item.itemId,
            rank: item.rank,
            score: item.score,
        }

        let suffix
        // 竞技场副本榜外部显示赛季第一天取实时榜单数据，其他天取昨日数据
        if (item.rankType === RankDefine.TYPE_ARENA_TIER_DAILY) {
            // seasonData = Arena.getSvSeasonItem();
            const seasonData = { startTime: timestamp() }
            const now = timestamp()
            if (UtilTime.getDayStartTime(seasonData.startTime) == UtilTime.getDayStartTime(now)) {
                // 赛季第一天
                suffix = UtilTime.formatYMD(now)
            } else {
                const nextDayTs = UtilTime.nextDayTime(now)
                suffix = UtilTime.formatYMD(nextDayTs)
            }

            const areaList = await RankAccess.getRedisRank(
                RankDefine.TYPE_ARENA_TIER_DAILY,
                sId,
                suffix,
            ).getRankIdScores(0, 1)

            for (const { score, value } of areaList) {
                pbMemberId = value.toString()
                pbScore = score
                break
            }
            pbItem.memberId = pbMemberId
            pbItem.score = pbScore
        }
        resp.push(pbItem)
        if (!pbMemberId) {
            continue
        }

        let uId
        if (RankDefine.CONF.get(item.rankType)?.rankRef === RankGuildRef) {
            const guild = await Guild.load(pbMemberId)
            uId = guild!.leaderId
            // pbItem.setGuildInfo(UtilProtobuf.pbFromObject(guild, CommonGuildInfo.class))
        } else {
            uId = pbMemberId
        }
        const huser = await User.load(uId)
        if (huser) {
            pbItem.userInfo = UserProfileFormatter.format(huser).toModData() as any
        }
    }
    return resp
}
