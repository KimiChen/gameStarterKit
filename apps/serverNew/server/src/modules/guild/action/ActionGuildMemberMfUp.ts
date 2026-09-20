import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { AttrTypeBean } from '../../attr/bean/AttrTypeBean'
import { Attr } from '../../attr/calculation/Attr'
import { AttrModDefine } from '../../attr/rules/AttrModDefine'
import { Props } from '../../props/inventory/Props'
import { UserFp } from '../../user/action/UserFp'
import { User } from '../../user/bean/User'
import { PowerScoreRules } from '../../user/rules/PowerScoreRules'
import { ReqGuildMemberMfUp } from '../GuildC2S'
import { GuildErrors } from '../GuildErrors'
import { ActionGuild } from './ActionGuild'

/**
 * 妖盟秘法升级
 */
export class ActionGuildMemberMfUp extends ActionGuild {
    async doAction(req: ReqGuildMemberMfUp, res: ResDefault) {
        const user = this.user
        const id = req.id

        const conf = C.guild_mf(id)

        if (!user.guildMFList.has(id)) {
            user.guildMFList.set(id, 0)
        }

        let mfLv = user.guildMFList.get(id)!
        const lvConf = conf.lv.get(mfLv)
        if (!lvConf) {
            throw SystemErrors.SysConfErr
        }

        // 联盟等级限制
        if (lvConf.need > (await ActionGuild.getGuildLevel(user.guild))) {
            throw GuildErrors.GuildLvLimit
        }

        // 升级消耗
        await Props.costProp(user, lvConf.costId, lvConf.costNum)

        mfLv++
        user.guildMFList.set(id, mfLv)

        // 更新秘法属性
        Attr.updateAttrModItem(user, AttrModDefine.Mf, getMfAttrs(user))

        // 更新评分
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_MF)
    }
}

/**
 * 获取秘法属性
 * @param user
 * @returns
 */
function getMfAttrs(user: User) {
    const attrs: Map<int, AttrTypeBean> = new Map()
    for (const [id, lv] of user.guildMFList) {
        const conf = C.guild_mf(id).lv.get(lv)!
        const attrType = conf.attrType
        const val = conf.value
        let attrItem = attrs.get(attrType)
        if (attrItem == null) {
            attrItem = new AttrTypeBean({
                type: attrType,
            })
            attrs.set(attrType, attrItem)
        }
        attrItem.val += val
    }
    return attrs
}
