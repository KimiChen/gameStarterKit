import { GuildRoleDefine } from '../rules/GuildRoleDefine'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ReqGuildMemberMagicActivate } from '../GuildC2S'
import { ActionGuild } from './ActionGuild'

/**
 * 法阵-激活
 */
export class ActionGuildMemberMagicActivate extends ActionGuild {
    async doAction(req: ReqGuildMemberMagicActivate, res: ResDefault) {
        // 权限校验
        const guild = await ActionGuild.checkPower(this.user, GuildRoleDefine.ACTION_MAGIC)

        // 阵法id
        const magicId = req.id

        // 已激活判断
        if (guild.activeMagicId === magicId) {
            return
        }

        // 初始化法阵
        if (!guild.magics.has(magicId)) {
            guild.magics.set(magicId, 1)
        }

        // 激活法阵
        guild.activeMagicId = magicId
    }
}
