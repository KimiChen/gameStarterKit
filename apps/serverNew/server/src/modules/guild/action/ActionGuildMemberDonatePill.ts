import { GuildRoleDefine } from '../rules/GuildRoleDefine'
import { ItemIdDefine } from '../../props/rules/ItemIdDefine'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ReqGuildMemberDonatePill } from '../GuildC2S'
import { ActionGuild } from './ActionGuild'
import { Props } from '../../props/inventory/Props'

/**
 * 捐献妖丹
 */
export class ActionGuildMemberDonatePill extends ActionGuild {
    async doAction(req: ReqGuildMemberDonatePill, res: ResDefault) {
        const user = this.user
        const num = req.num

        // 权限校验
        const guild = await ActionGuild.checkPower(user, GuildRoleDefine.ACTION_DONATE_PILL)

        // 扣除妖丹
        await Props.costProp(user, ItemIdDefine.ITEM_ID_DEMON_PILL, num)

        // 转化未妖盟妖丹资源
        guild.demonPill += num

        // 任务
        // 数数
    }
}
