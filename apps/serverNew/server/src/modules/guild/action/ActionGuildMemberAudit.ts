import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { UserErrors } from '../../user/UserErrors'
import { User } from '../../user/bean/User'
import { ReqGuildMemberAudit } from '../GuildC2S'
import { GuildErrors } from '../GuildErrors'
import { Guild } from '../bean/Guild'
import { UserGuildApply } from '../bean/UserGuildApply'
import { GuildDefine } from '../rules/GuildDefine'
import { GuildRoleDefine } from '../rules/GuildRoleDefine'
import { ActionGuild } from './ActionGuild'

/**
 * 联盟加入审核
 */
export class ActionGuildMemberAudit extends ActionGuild {
    async doAction(req: ReqGuildMemberAudit, res: ResDefault) {
        const user = this.user

        // 校验权限
        const guildCache = await ActionGuild.checkPower(user, GuildRoleDefine.ACTION_AUDIT)

        // 操作 1 同意 2 拒绝 3 拒绝所有
        const action = req.action
        // 被操作对象的用户id
        const targetId = req.targetId

        // 需要指定目标玩家的action
        if (!targetId && (action == GuildDefine.AUDIT_AGREE || action == GuildDefine.AUDIT_REJECT)) {
            throw SystemErrors.SysParamError
        }

        switch (action) {
            case GuildDefine.AUDIT_AGREE: {
                // 同意
                await actionAccept(guildCache, targetId)
                break
            }
            case GuildDefine.AUDIT_REJECT: {
                // 拒绝
                await actionReject(guildCache, targetId)
                break
            }
            case GuildDefine.AUDIT_REJECT_ALL: {
                // 拒绝所有
                await actionReject(guildCache)
                break
            }
            case GuildDefine.AUDIT_ACCEPT_ALL: {
                // 拒绝所有
                await actionAccept(guildCache)
                break
            }
            default:
                throw SystemErrors.SysParamError
        }
    }
}

/**
 * 拒绝加入
 * @param guildCache
 * @param targetId
 * @returns
 */
async function actionReject(guildCache: Guild, targetId: int = 0) {
    const deleteUIds: int[] = []

    // 删除联盟申请记录
    if (targetId > 0) {
        // 拒绝指定玩家
        deleteUIds.push(targetId)
        guildCache.applyMembers.delete(targetId)
    } else {
        // 全部拒绝
        deleteUIds.push(...guildCache.applyMembers.keys())
        guildCache.applyMembers.clear()
    }

    // 删除玩家的申请记录
    for (const uId of deleteUIds) {
        const userApply = await UserGuildApply.load(uId)
        userApply?.records.delete(guildCache.guildId)
    }

    // 被拒绝弹窗推送
    // Push.sendSystemInfoById()
}

/**
 * 通过申请
 * @param guildCache
 * @param targetId
 */
async function actionAccept(guildCache: Guild, targetId: int = 0) {
    const maxNum = C.guild(guildCache.lv).count

    // 联盟成员已满
    if (guildCache.members.size() >= maxNum) {
        throw GuildErrors.GuildMemberFull
    }

    const acceptUIds: int[] = []
    if (targetId) {
        // 通过指定玩家
        acceptUIds.push(targetId)
    } else {
        // 通过所有玩家
        acceptUIds.push(...guildCache.applyMembers.keys())
    }

    for (const uId of acceptUIds) {
        const targetUser = await User.load(uId)
        if (!targetUser) {
            throw UserErrors.UserNoUser
        }

        // 已加盟
        if (targetUser.guild ?? 0 > 0) {
            throw GuildErrors.GuildTargetIsJoinOther
        }

        if (targetUser.guild && targetUser.guild > 0) {
            throw GuildErrors.GuildTargetIsJoinOther
        }

        // 该玩家没有申请
        if (!ActionGuild.checkUserIsApplyGuild(guildCache, targetUser.id)) {
            throw GuildErrors.GuildTargetNoApply
        }

        // 加入联盟
        await ActionGuild.addMember(guildCache, targetUser)
    }
}
