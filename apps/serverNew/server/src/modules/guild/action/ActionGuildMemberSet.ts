import { CenterGuildModel } from '../../../../generated/persistence/CenterGuildModel'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { Props } from '../../props/inventory/Props'
import { ReqGuildMemberSet } from '../GuildC2S'
import { GuildErrors } from '../GuildErrors'
import { GuildRoleDefine } from '../rules/GuildRoleDefine'
import { ActionGuild } from './ActionGuild'

/**
 * 修改联盟信息
 */
export class ActionGuildMemberSet extends ActionGuild {
    async doAction(req: ReqGuildMemberSet, res: ResDefault) {
        // 校验权限-修改联盟信息
        const guildCache = await ActionGuild.checkPower(this.user, GuildRoleDefine.ACTION_BASE)

        const notice = decodeURIComponent(req.notice) // 公告
        const head = req.head // 图标
        const open = req.open // 自由加入状态
        const contact = req.contract // 盟主联系方式
        const name = req.name // 名称

        // 参数校验
        ActionGuild.validate(head, open, name, notice, contact)

        // 修改公告
        if (notice !== guildCache.notice) {
            await ActionGuild.checkPower(this.user, GuildRoleDefine.ACTION_SET_NOTICE)
            guildCache.notice = notice
        }

        // 修改图标
        if (head && head !== guildCache.head) {
            await ActionGuild.checkPower(this.user, GuildRoleDefine.ACTION_SET_HEAD)

            // 不是初始旗帜 且 未拥有
            if (!C.guild_flag(head).start && !guildCache.heads.includes(head)) {
                throw SystemErrors.SysParamError
            }

            // 设置联盟头像
            guildCache.head = head
        }

        // 修改自由加入状态
        if (open && open !== guildCache.open) {
            await ActionGuild.checkPower(this.user, GuildRoleDefine.ACTION_SET_OPEN)
            guildCache.open = open
        }

        // 修改盟主联系方式
        if (contact !== guildCache.contact) {
            await ActionGuild.checkPower(this.user, GuildRoleDefine.ACTION_SET_CONTACT)
            guildCache.contact = contact
        }

        // 修改名称
        if (name !== guildCache.name) {
            await ActionGuild.checkPower(this.user, GuildRoleDefine.ACTION_SET_NAME)
            // 道具消耗
            await Props.costProp(this.user, Param.GuildChangeNameCost[0], Param.GuildChangeNameCost[1])

            // 判断妖盟名字是否被使用
            if ((await CenterGuildModel.count({ where: { guildName: name } })) > 0) {
                // 妖盟名称已被占用
                throw GuildErrors.GuildNameHasExist
            }
            guildCache.name = name
        }
    }
}
