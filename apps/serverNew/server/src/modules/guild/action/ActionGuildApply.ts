import { ApiCall, timestamp } from '@arthropoda/game-engine'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { UserErrors } from '../../user/UserErrors'
import { User } from '../../user/bean/User'
import { ReqGuildApply } from '../GuildC2S'
import { GuildErrors } from '../GuildErrors'
import { Guild } from '../bean/Guild'
import { GuildDefine } from '../rules/GuildDefine'
import { ActionGuild } from './ActionGuild'

/**
 * 申请加入联盟
 */
export class ActionGuildApply extends ActionGuild {
    async getBindId(call: ApiCall): Promise<number | undefined> {
        return (call.req as ReqGuildApply).guildId
    }

    async doAction(req: ReqGuildApply, res: ResDefault) {
        const user = this.user
        const guildId = req.guildId
        if (!guildId) {
            throw SystemErrors.SysParamError
        }

        // 检测能否加入
        ActionGuild.checkJoin(user)

        // 获取申请加入的联盟信息
        const guildBase = await ActionGuild.load(guildId)
        if (!guildBase) {
            throw GuildErrors.GuildDissolution
        }

        // 校验联盟成员人数限制
        const maxNum = C.guild(guildBase.lv).count
        if (guildBase.members.size() >= maxNum) {
            throw GuildErrors.GuildMemberFull // 联盟成员已满
        }

        const applyConf = C.guild_apply(guildBase.open)

        switch (applyConf.type) {
            case GuildDefine.JOINT_TYPE_NO_CONDITION: {
                // 无条件
                // 执行加入联盟操作
                await ActionGuild.addMember(guildBase, user)
                break
            }
            case GuildDefine.JOIN_TYPE_AUDIT: {
                // 审核加入
                await addByApply(user, guildBase)
                break
            }
            case GuildDefine.JOINT_TYPE_CONDITION: // 条件加入
                {
                    if (user.lv < applyConf.value) {
                        throw UserErrors.UserLvIsSmall
                    }
                    await ActionGuild.addMember(guildBase, user)
                }
                break
            default:
                throw SystemErrors.SysParamError
        }
    }
}

/**
 * 审核加入
 * @param guildId
 * @param hGuild
 */
async function addByApply(user: User, guildBase: Guild) {
    const userApply = await ActionGuild.loadUserApply(user.id)
    // 限制玩家申请联盟次数
    if (userApply!.records.size() ?? 0 >= Param.GuildLogLimit) {
        throw GuildErrors.GuildApplyFull
    }

    //玩家已经申请该联盟
    if (guildBase.applyMembers.has(user.id)) {
        throw GuildErrors.GuildHasApply
    }

    const now = timestamp()
    //申请记录
    guildBase.applyMembers.set(user.id, now)
    userApply!.records.set(guildBase.guildId, now)
}
