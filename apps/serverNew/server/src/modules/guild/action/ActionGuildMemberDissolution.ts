import { GuildMemberRef } from '../ref/GuildMemberRef'
import { CenterGuildModel } from '../../../../generated/persistence/CenterGuildModel'
import { GuildDefine } from '../rules/GuildDefine'
import { GuildRoleDefine } from '../rules/GuildRoleDefine'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ReqGuildMemberDissolution } from '../GuildC2S'
import { UtilTime } from '@arthropoda/game-engine'
import { ActionGuild } from './ActionGuild'

/**
 * 解散联盟
 */
export class ActionGuildMemberDissolution extends ActionGuild {
    async doAction(req: ReqGuildMemberDissolution, res: ResDefault) {
        const user = this.user

        // 校验权限-解散联盟
        const guildCache = await ActionGuild.checkPower(user, GuildRoleDefine.ACTION_DISSOLUTION)

        // 踢掉所有成员
        const memberIds = guildCache.members.keys()
        const userRefs = await GuildMemberRef.loadAll(memberIds)
        for (const memberId of memberIds) {
            const target = userRefs.get(memberId)
            if (!target) {
                continue
            }
            await ActionGuild.quitGuild(memberId, guildCache, GuildDefine.QUIT_TYPE_DISSOLUTION, false)
        }

        // 为了在解散接口的下发带上玩家身上联盟信息的change
        user.guild = 0
        user.guildRole = 0
        user.guildName = ''

        // 解散联盟
        //删除妖盟表数据
        await CenterGuildModel.delete(guildCache.guildId)
        // 删除申请表数据
        guildCache.applyMembers.clear()

        // 设置解散妖盟的过期时间 预留15天
        guildCache.isDissolution = true
        await guildCache.refreshExpire(UtilTime.DAY_SECOND * 15)
    }
}
