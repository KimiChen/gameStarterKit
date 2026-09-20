import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ReqGuildMemberAssign } from '../GuildC2S'
import { GuildErrors } from '../GuildErrors'
import { Guild } from '../bean/Guild'
import { GuildDefine } from '../rules/GuildDefine'
import { GuildRoleDefine } from '../rules/GuildRoleDefine'
import { ActionGuild } from './ActionGuild'

/**
 * 妖盟职位任命
 */
export class ActionGuildMemberAssign extends ActionGuild {
    async doAction(req: ReqGuildMemberAssign, res: ResDefault) {
        const user = this.user

        // 校验权限
        const guildCache = await ActionGuild.checkPower(user, GuildRoleDefine.ACTION_ASSIGN)

        const targetId = req.targetId // 被操作的成员id
        const role = req.role // 职位id

        // 不能任命自己,不能对盟主进行任免
        if (targetId == user.id || !GuildDefine.roleMap.has(role)) {
            throw SystemErrors.SysParamError
        }

        // 判断成员是否在自己的联盟里面
        if (!guildCache.members.has(targetId)) {
            throw SystemErrors.SysParamError
        }

        // 判断成员是否已经是这个职位
        if (role == guildCache.members.get(targetId)!.role) {
            throw SystemErrors.SysParamError
        }

        // 职位上限判断
        checkRoleLimit(guildCache, targetId, role)

        // 任命操作
        await ActionGuild.memberAssign(guildCache, user.id, targetId, role)
    }
}

/**
 * 检验官员是否达到上限
 * @param guild
 * @param targetId
 * @param role
 * @returns
 */
function checkRoleLimit(guild: Guild, targetId: int, role: int): void {
    // 盟主 或者 成员不校验
    if (role === GuildDefine.ROLE_MEMBER || role === GuildDefine.ROLE_LEADER) {
        return
    }

    // 已有职位数量
    const hasNum = getRoleNum(guild, targetId, role)
    const guildConf = C.guild(guild.lv)

    let limit = 0
    if (role == GuildDefine.ROLE_DEPUTY_LEADER) {
        limit = guildConf.deputyGuildLeader
    } else if (role == GuildDefine.ROLE_OLDER) {
        limit = guildConf.elders
    }

    // 联盟职位数量达到上限
    if (hasNum >= limit) {
        throw GuildErrors.GuildRoleMaxCnt
    }
}

/**
 * 获取对应职位的成员数量
 * @param guildCache
 * @param targetId
 * @param role
 * @returns
 */
function getRoleNum(guildCache: Guild, targetId: int, role: int): int {
    let num = 0
    for (const [, member] of guildCache.members) {
        if (targetId != member.uId && role == member.role) {
            num++
        }
    }
    return num
}
