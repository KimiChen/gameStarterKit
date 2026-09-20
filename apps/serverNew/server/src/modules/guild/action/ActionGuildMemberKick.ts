import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { UserErrors } from '../../user/UserErrors'
import { ReqGuildMemberKick } from '../GuildC2S'
import { GuildErrors } from '../GuildErrors'
import { GuildMemberRef } from '../ref/GuildMemberRef'
import { GuildDefine } from '../rules/GuildDefine'
import { GuildRoleDefine } from '../rules/GuildRoleDefine'
import { ActionGuild } from './ActionGuild'

/**
 * 踢出联盟成员
 */
export class ActionGuildMemberKick extends ActionGuild {
    async doAction(req: ReqGuildMemberKick, res: ResDefault) {
        const user = this.user
        const targetId = req.targetId

        // 校验权限-踢出
        const guildCache = await ActionGuild.checkPower(user, GuildRoleDefine.ACTION_KICK)

        // 不能踢自己
        if (targetId === user.id) {
            throw SystemErrors.SysParamError
        }

        // 判断成员是否在自己的联盟里面
        if (!guildCache.members.has(targetId)) {
            throw SystemErrors.SysParamError
        }

        // 只能踢职位比自己小的
        if (guildCache.members.get(targetId)!.role <= guildCache.members.get(user.id)!.role) {
            throw GuildErrors.GuildNoPower
        }

        const targetUser = await GuildMemberRef.load(targetId)
        if (!targetUser) {
            throw UserErrors.UserNoUser
        }

        await ActionGuild.quitGuild(targetId, guildCache, GuildDefine.QUIT_TYPE_KICK)
    }
}
