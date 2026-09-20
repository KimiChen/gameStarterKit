import { CenterGuildModel } from '../../../../generated/persistence/CenterGuildModel'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ReqGuildMemberQuickJoin } from '../GuildC2S'
import { GuildErrors } from '../GuildErrors'
import { GuildRef } from '../ref/GuildRef'
import { GuildDefine } from '../rules/GuildDefine'
import { ActionGuild } from './ActionGuild'

/**
 * 快速加入联盟
 */
export class ActionGuildMemberQuickJoin extends ActionGuild {
    async doAction(req: ReqGuildMemberQuickJoin, res: ResDefault) {
        const user = this.user

        ActionGuild.checkJoin(user)

        // 获取当前可落
        const guildList = await CenterGuildModel.find({
            where: {
                sid: user.sId,
            },
        })

        const gIds: int[] = []
        guildList.forEach((e) => {
            gIds.push(e.guildId)
        })

        const find: { id: int; lv: int }[] = []

        // 取出联盟数据缓存
        const guildRefs = await GuildRef.loadAll(gIds)

        for (const [, guildRef] of guildRefs) {
            // 是否为开放联盟
            if (guildRef.open !== GuildDefine.JOINT_TYPE_NO_CONDITION) {
                continue
            }

            // 已解散
            if (guildRef.isDissolution) {
                continue
            }

            const maxNum = C.guild(guildRef.lv).count
            // 判断联盟成员是否还能加人
            const memberNum = guildRef.members?.size() ?? 0
            if (memberNum >= maxNum) {
                continue
            }

            find.push({
                id: guildRef.id,
                lv: guildRef.lv,
            })
        }

        if (find.length == 0) {
            throw GuildErrors.GuildNoRandGuild
        }

        // 联盟等级>id
        find.sort((a, b) => {
            if (a.lv == b.lv) {
                return a.id - b.id
            }
            return b.lv - a.lv
        })

        //TODO:通过转发消息处理加入,因为需要加入的联盟可能未绑定在当前联盟服务
        // 加入联盟
        const guildCache = await ActionGuild.load(find[0].id)
        if (!guildCache) {
            return
        }

        // 入盟
        await ActionGuild.addMember(guildCache, user)
    }
}
