import { GuildDefine } from '../rules/GuildDefine'
import { GuildRoleDefine } from '../rules/GuildRoleDefine'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ReqGuildMemberQuit } from '../GuildC2S'
import { ActionGuild } from './ActionGuild'

/**
 * 退出联盟
 */
export class ActionGuildMemberQuit extends ActionGuild {
    async doAction(req: ReqGuildMemberQuit, res: ResDefault) {
        // 校验权限
        const guildCache = await ActionGuild.checkPower(this.user, GuildRoleDefine.ACTION_QUIT)

        // 玩家主动退盟
        await ActionGuild.quitGuild(this.user.id, guildCache, GuildDefine.QUIT_TYPE_INITIATIVE)
    }
}
