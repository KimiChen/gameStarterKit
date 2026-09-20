import { FeatureAccess } from '../../../modules/user/access/FeatureAccess'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ModuleOpenType } from '../../user/access/ModuleOpenType'
import { User } from '../../user/bean/User'
import { ReqGuildInvite } from '../GuildC2S'
import { GuildErrors } from '../GuildErrors'
import { Guild } from '../bean/Guild'
import { ActionGuild } from './ActionGuild'

/**
 * 邀请加入联盟
 *
 * 旧二进制通道（`guild/PushInviteToGuild`）已随 P6 删除；邀请通知需按 shared 声明的
 * 领域推送，在 guild 模块的 NativeLobbyStore 内显式发送。
 * ⛔ 不要在此处恢复框架级隐式推送。
 */
export class ActionGuildInvite extends ActionGuild {
    async doAction(req: ReqGuildInvite, res: ResDefault) {
        if (!this.user.guild) {
            throw SystemErrors.SysParamErr
        }

        const guild = await Guild.loadOnlyRead(this.user.guild)
        if (!guild) {
            throw SystemErrors.SysParamErr
        }

        const inviteId = req.uId
        if (!inviteId) {
            throw SystemErrors.SysParamErr
        }

        const inviteUser = await User.loadOnlyRead(inviteId)
        if (!inviteUser) {
            throw SystemErrors.SysParamErr
        }

        if (!FeatureAccess.check(inviteUser, ModuleOpenType.SYS_GUILD)) {
            throw GuildErrors.GuildSysNotOpen
        }
        // 对方已屏蔽邀请
        if (inviteUser.maskInviteGuild.includes(this.user.id)) {
            return
        }

        // 对方已加入联盟
        if (inviteUser.guild) {
            return
        }
    }
}
