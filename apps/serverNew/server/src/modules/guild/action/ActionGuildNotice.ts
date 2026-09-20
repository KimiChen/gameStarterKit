import { timestamp } from '@arthropoda/game-engine'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { RankAccess } from '../../rank/persistence/RankAccess'
import { RankDefine } from '../../rank/rules/RankDefine'
import { SystemInfoDefine } from '../../serverSettings/runtime/SystemInfoDefine'
import { User } from '../../user/bean/User'
import { ReqGuildNotice } from '../GuildC2S'
import { GuildErrors } from '../GuildErrors'
import { GuildNoticeItem } from '../bean/GuildNoticeItem'
import { GuildRoleDefine } from '../rules/GuildRoleDefine'
import { ActionGuild } from './ActionGuild'

/**
 * 提醒
 */
export class ActionGuildNotice extends ActionGuild {
    NOTICE_TYPE_RED = 1

    NOTICE_TYPE_BOSS = 2

    NOTICE_TYPE_BARGAIN = 3

    TYPE_ARRAY = [this.NOTICE_TYPE_BOSS, this.NOTICE_TYPE_BARGAIN, this.NOTICE_TYPE_RED]

    async doAction(req: ReqGuildNotice, res: ResDefault) {
        const type = req.type
        const guild = await ActionGuild.checkPower(this.user, GuildRoleDefine.ACTION_NOTICE)

        if (!this.TYPE_ARRAY.includes(type)) {
            throw SystemErrors.SysParamError
        }

        //  提醒cd
        let cdItem = this.user.guildNoticeCds.get(type)
        if (!cdItem) {
            cdItem = new GuildNoticeItem(type)
            this.user.guildNoticeCds.set(type, cdItem)
        }

        const time = timestamp()
        if ((cdItem.lastNoticeTime ?? 0) + Param.GuildRemindCd >= time) {
            throw GuildErrors.GuildDonateCd
        }

        const uIds = []
        let systemInfoId = 0
        switch (type) {
            case this.NOTICE_TYPE_RED:
                // 功绩红包
                systemInfoId = SystemInfoDefine.GuildRedNotce_113
                for (const [, member] of guild.members) {
                    if (member.dayBuildTimes) {
                        continue
                    }

                    uIds.push(member.uId)
                }
                break
            case this.NOTICE_TYPE_BOSS:
                // 试炼
                systemInfoId = SystemInfoDefine.GuildBossNotice_114
                for (const [, member] of guild.members) {
                    const rank = RankAccess.getRedisRank(RankDefine.TYPE_GUILD_MEMBER_SCORE, guild.id)
                    if (await rank.getTargetRank(member.uId)) {
                        continue
                    }
                    uIds.push(member.uId)
                }
                break
            case this.NOTICE_TYPE_BARGAIN:
                // 砍价
                systemInfoId = SystemInfoDefine.GuildBargainNotice_115
                for (const [, member] of guild.members) {
                    const u = await User.loadOnlyRead(member.uId)
                    if (u!.dayBargainTimes) {
                        continue
                    }
                    uIds.push(member.uId)
                }
                break
        }

        if (!uIds || !systemInfoId) {
            throw SystemErrors.SysParamErr
        }

        cdItem.lastNoticeTime = time

        // Push.sendSystemInfoById(systemInfoId,
        //     [[SystemInfoDefine.PARAM_AT_NAMES, uIds]],
        //     [[Push.ARGS_HUSER.this.user], [Push.ARGS_GUILD_ID.guild.id]],
        //     uIds,
        // )
    }
}
