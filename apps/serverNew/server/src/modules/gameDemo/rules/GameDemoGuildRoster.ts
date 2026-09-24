import type { ReadonlyBean } from '@arthropoda/game-engine'
import { GAME_DEMO_CONFIG } from '../../../../generated/lobby-contract/protocol/lobbyRpc/checks/gameDemo'
import type {
    IGameDemoGuild,
    IGameDemoGuildInvite,
    IGameDemoGuildState,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import type { GameDemoGuildDirectory } from '../bean/GameDemoGuildDirectory'

type DirectoryView = GameDemoGuildDirectory | ReadonlyBean<GameDemoGuildDirectory>

/**
 * 仙盟：盟主按玩家 ID 邀请，对方接受或拒绝；最多 3 人，盟主离开按加入顺序转交，最后一人离开解散。
 * 目录是一份整体资源，所有写入在仙盟串行组内执行。
 */
export class GameDemoGuildRoster {
    static view(directory: DirectoryView | undefined, uid: number): IGameDemoGuildState {
        const member = directory?.members?.get(uid)
        const guild = member ? this.guildView(directory!, member.guildId) : null
        return { uid, guild, invitations: guild ? [] : this.invitationsOf(directory, uid) }
    }

    static create(directory: GameDemoGuildDirectory, uid: number, name: string): void {
        if (directory.members!.has(uid)) throw { code: 'GAME_DEMO_GUILD_JOINED', msg: '已加入仙盟' }
        const id = ++directory.guildSeq
        directory.guilds!.set(id, { id, name: name.trim(), owner: uid })
        this.join(directory, uid, id)
    }

    /** 同一仙盟对同一目标的未处理邀请只保留一条。 */
    static invite(directory: GameDemoGuildDirectory, uid: number, target: number, targetReady: boolean): void {
        const member = directory.members!.get(uid)
        const guild = member && directory.guilds!.get(member.guildId)
        if (!guild || guild.owner !== uid) throw { code: 'GAME_DEMO_GUILD_OWNER_ONLY', msg: '仅盟主可以邀请' }
        if (!targetReady) throw { code: 'GAME_DEMO_TARGET_NOT_READY', msg: '目标玩家尚未开放玩法' }
        if (directory.members!.has(target)) throw { code: 'GAME_DEMO_GUILD_JOINED', msg: '目标玩家已加入仙盟' }
        const pending = this.invitationsOf(directory, target)
        if (pending.some((invite) => invite.guildId === guild.id)) return
        if (pending.length >= GAME_DEMO_CONFIG.guildInviteLimit)
            throw { code: 'GAME_DEMO_INVITE_FULL', msg: '对方待处理邀请已满' }
        const id = ++directory.inviteSeq
        directory.invites!.set(id, { id, guildId: guild.id, inviter: uid, target })
    }

    static respond(directory: GameDemoGuildDirectory, uid: number, inviteId: number, accept: boolean): void {
        const invite = directory.invites!.get(inviteId)
        if (!invite || invite.target !== uid || !this.isValid(directory, invite))
            throw { code: 'GAME_DEMO_INVITE_INVALID', msg: '邀请已失效或不属于当前玩家' }
        if (!accept) {
            directory.invites!.delete(inviteId)
            return
        }
        if (directory.members!.has(uid)) throw { code: 'GAME_DEMO_GUILD_JOINED', msg: '已加入仙盟' }
        if (this.membersOf(directory, invite.guildId).length >= GAME_DEMO_CONFIG.guildCapacity)
            throw { code: 'GAME_DEMO_GUILD_FULL', msg: '仙盟人数已满' }
        this.join(directory, uid, invite.guildId)
    }

    static leave(directory: GameDemoGuildDirectory, uid: number): void {
        const member = directory.members!.get(uid)
        if (!member) return
        const guild = directory.guilds!.get(member.guildId)!
        directory.members!.delete(uid)
        const remaining = this.membersOf(directory, guild.id)
        if (!remaining.length) {
            directory.guilds!.delete(guild.id)
            for (const invite of directory.invites!.values())
                if (invite.guildId === guild.id) directory.invites!.delete(invite.id)
        } else if (guild.owner === uid) {
            guild.owner = remaining[0]
        }
    }

    private static join(directory: GameDemoGuildDirectory, uid: number, guildId: number): void {
        directory.members!.set(uid, { uid, guildId, joinSeq: ++directory.joinSeq })
        for (const invite of directory.invites!.values())
            if (invite.target === uid) directory.invites!.delete(invite.id)
    }

    /** 按加入顺序排列的成员。 */
    private static membersOf(directory: DirectoryView, guildId: number): number[] {
        const members: { uid: number; joinSeq: number }[] = []
        directory.members?.forEach((member) => {
            if (member.guildId === guildId) members.push({ uid: member.uid, joinSeq: member.joinSeq })
        })
        return members.sort((a, b) => a.joinSeq - b.joinSeq).map((member) => member.uid)
    }

    private static guildView(directory: DirectoryView, guildId: number): IGameDemoGuild | null {
        const guild = directory.guilds?.get(guildId)
        if (!guild) return null
        return { id: guild.id, name: guild.name, owner: guild.owner, members: this.membersOf(directory, guildId) }
    }

    /** 邀请在仙盟解散或邀请者不再是盟主时失效。 */
    private static isValid(
        directory: DirectoryView,
        invite: { readonly guildId: number; readonly inviter: number },
    ): boolean {
        return directory.guilds?.get(invite.guildId)?.owner === invite.inviter
    }

    private static invitationsOf(directory: DirectoryView | undefined, uid: number): IGameDemoGuildInvite[] {
        const invitations: IGameDemoGuildInvite[] = []
        directory?.invites?.forEach((invite) => {
            if (invite.target !== uid || !this.isValid(directory, invite)) return
            invitations.push({
                id: invite.id,
                guildId: invite.guildId,
                guildName: directory.guilds!.get(invite.guildId)!.name,
                inviter: invite.inviter,
            })
        })
        return invitations.sort((a, b) => a.id - b.id)
    }
}
