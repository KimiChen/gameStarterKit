import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ReqGuildMemberMagicUpgrade } from '../GuildC2S'
import { GuildErrors } from '../GuildErrors'
import { GuildRoleDefine } from '../rules/GuildRoleDefine'
import { ActionGuild } from './ActionGuild'

/**
 * 法阵-升级
 */
export class ActionGuildMemberMagicUpgrade extends ActionGuild {
    async doAction(req: ReqGuildMemberMagicUpgrade, res: ResDefault) {
        const user = this.user
        // 法阵id
        const magicId = req.id

        // 权限校验
        const guild = await ActionGuild.checkPower(user, GuildRoleDefine.ACTION_MAGIC)

        // 配置
        const magicConf = C.guild_magic(magicId)

        // 初始化法阵
        let magicLv = guild.magics.get(magicId)
        if (!magicLv) {
            magicLv = 1
            guild.magics.set(magicId, magicLv)
        }

        // 消耗判断
        const magicCurConf = magicConf.lv.get(magicLv)!
        const cost = magicCurConf.costNum
        if (cost <= 0) {
            throw GuildErrors.GuildMagicMaxLv
        }

        // 妖盟等级校验
        if (guild.lv < magicCurConf.need) {
            throw GuildErrors.GuildMagicUnLock
        }

        // 消耗不足判断
        if (guild.demonPill < cost) {
            throw GuildErrors.GuildPillNotEnough
        }

        // 扣除消耗
        guild.demonPill -= cost

        // 升级法阵
        magicLv++
        guild.magics.set(magicId, magicLv)

        // 同步场景：当前升级法阵为激活法阵则同步
        if (magicId === guild.activeMagicId) {
            // SceneSync.syncSceneGuild(guild)
        }
    }
}
