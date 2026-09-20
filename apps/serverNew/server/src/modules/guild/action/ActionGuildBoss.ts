import { RankDefine } from '../../rank/rules/RankDefine'
import { ReqGuildBoss, ResGuildBoss } from '../GuildC2S'
import { ActionGuild } from './ActionGuild'
import { RankAccess } from '../../rank/persistence/RankAccess'

/**
 * 获取山头boss信息
 */
export class ActionGuildBoss extends ActionGuild {
    async doAction(req: ReqGuildBoss, res: ResGuildBoss) {
        // 检测是否拥有联盟
        const guild = await ActionGuild.checkUserGuild(this.user)

        // 重置联盟信息
        await ActionGuild.dayInit(guild)

        // 获取排行信息
        const rs = await RankAccess.getRedisRank(
            RankDefine.TYPE_GUILD_MEMBER_SCORE,
            guild.sId,
            String(guild.id),
        ).getTargetRankInfos(this.user.id)

        res.rank = rs.rank
        res.score = rs.score
    }
}
