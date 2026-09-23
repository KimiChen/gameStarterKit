import { GameDemoHash as AtomicHash, GameDemoOperation as AtomicOperation } from '../GameDemoPersistence'
import { randomUUID } from 'node:crypto'
import { AtomicHashTransaction, atomicJsonCodec } from '@arthropoda/game-engine'
import { GameDemoAccount } from '../growth/GameDemoAccount'
import { GAME_DEMO_CONFIG } from '../../../../generated/lobby-contract/kits/gameDemo/config'
import type {
    GameDemoGuild as GuildView,
    GameDemoGuildInvite,
} from '../../../../generated/lobby-contract/kits/gameDemo/api/guild'
import {
    validateGameDemoGuild,
    validateGameDemoGuildInvite,
    validateGameDemoGuildRes,
    type IGameDemoGuildRes,
    type IGameDemoGuildCreateReq,
    type IGameDemoGuildInviteReq,
    type IGameDemoGuildRespondReq,
    type IGameDemoGuildLeaveReq,
} from '../../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoGuild'
interface GuildRecord {
    schemaVersion: 1
    revision: number
    view: GuildView | null
}
interface Membership {
    schemaVersion: 1
    revision: number
    guildId: string | null
    invitations: GameDemoGuildInvite[]
}
const guildCodec = atomicJsonCodec<GuildRecord>((v): v is GuildRecord => {
    const g = v as GuildRecord | null
    if (!g || g.schemaVersion !== 1 || !Number.isSafeInteger(g.revision) || g.revision < 1) return false
    try {
        if (g.view) validateGameDemoGuild(g.view)
        else if (g.view !== null) return false
    } catch {
        return false
    }
    return g.view === null || g.view.revision === g.revision
})
const memberCodec = atomicJsonCodec<Membership>((v): v is Membership => {
    const m = v as Membership | null
    if (
        !m ||
        m.schemaVersion !== 1 ||
        !Number.isSafeInteger(m.revision) ||
        m.revision < 0 ||
        (m.guildId !== null && (typeof m.guildId !== 'string' || !m.guildId))
    )
        return false
    if (!Array.isArray(m.invitations) || m.invitations.length > 20 || (m.guildId !== null && m.invitations.length > 0))
        return false
    try {
        m.invitations.forEach(validateGameDemoGuildInvite)
    } catch {
        return false
    }
    return new Set(m.invitations.map((i) => i.id)).size === m.invitations.length
})

/** Guild membership, capacity and invitations share one atomic read set across players. */
export class GameDemoGuild {
    private readonly guilds = new AtomicHash('kt:gameDemo:guilds:v1', guildCodec)
    private readonly memberships = new AtomicHash('kt:gameDemo:guild-memberships:v1', memberCodec)
    private readonly operations = new AtomicOperation(
        'kt:gameDemo:guild-operations:v1',
        (v): v is IGameDemoGuildRes => {
            try {
                validateGameDemoGuildRes(v)
                return true
            } catch {
                return false
            }
        },
    )
    async read(uid: string, sid: number): Promise<IGameDemoGuildRes> {
        return AtomicHashTransaction.run((tx) => this.snapshot(tx, uid, sid))
    }
    async create(uid: string, sid: number, req: IGameDemoGuildCreateReq): Promise<IGameDemoGuildRes> {
        const id = randomUUID()
        return this.run(uid, sid, 'create', req, async (tx) => {
            const account = await new GameDemoAccount().snapshot(tx, uid, sid)
            if (!account.initialized) throw { code: 'GAME_DEMO_NOT_INITIALIZED', msg: '请先初始化玩法账号' }
            const member = await this.member(tx, uid, sid)
            if (member.guildId) throw { code: 'GAME_DEMO_GUILD_JOINED', msg: '已加入仙盟' }
            await tx.set(this.guilds, JSON.stringify([sid, id]), {
                schemaVersion: 1,
                revision: 1,
                view: { id, name: req.name, owner: uid, members: [uid], revision: 1 },
            })
            await tx.set(this.memberships, JSON.stringify([sid, uid]), {
                ...member,
                revision: member.revision + 1,
                guildId: id,
                invitations: [],
            })
        })
    }
    async invite(uid: string, sid: number, req: IGameDemoGuildInviteReq): Promise<IGameDemoGuildRes> {
        const id = randomUUID()
        return this.run(uid, sid, 'invite', req, async (tx) => {
            const own = await this.snapshot(tx, uid, sid)
            if (!own.guild || own.guild.owner !== uid)
                throw { code: 'GAME_DEMO_GUILD_OWNER_ONLY', msg: '仅盟主可以邀请' }
            const account = await new GameDemoAccount().snapshot(tx, req.targetUid, sid)
            if (!account.initialized) throw { code: 'GAME_DEMO_TARGET_NOT_READY', msg: '目标玩家尚未初始化玩法账号' }
            const target = await this.member(tx, req.targetUid, sid)
            if (target.guildId) throw { code: 'GAME_DEMO_GUILD_JOINED', msg: '目标玩家已加入仙盟' }
            const invitations = await this.validInvitations(tx, sid, target)
            if (invitations.some((i) => i.guildId === own.guild!.id)) return
            if (invitations.length === 20) throw { code: 'GAME_DEMO_INVITE_FULL', msg: '对方待处理邀请已满' }
            invitations.push({ id, guildId: own.guild.id, guildName: own.guild.name, inviter: uid })
            await tx.set(this.memberships, JSON.stringify([sid, req.targetUid]), {
                ...target,
                revision: target.revision + 1,
                invitations,
            })
        })
    }
    async respond(uid: string, sid: number, req: IGameDemoGuildRespondReq): Promise<IGameDemoGuildRes> {
        return this.run(uid, sid, 'respond', req, async (tx) => {
            const member = await this.member(tx, uid, sid)
            const invitation = member.invitations.find((i) => i.id === req.inviteId)
            if (!invitation) throw { code: 'GAME_DEMO_INVITE_INVALID', msg: '邀请已失效或不属于当前玩家' }
            if (req.accept) {
                if (member.guildId) throw { code: 'GAME_DEMO_GUILD_JOINED', msg: '已加入仙盟' }
                const record = await tx.get(this.guilds, JSON.stringify([sid, invitation.guildId]))
                const guild = record?.view
                if (!guild || guild.owner !== invitation.inviter)
                    throw { code: 'GAME_DEMO_INVITE_INVALID', msg: '仙盟已解散或邀请者不再是盟主' }
                if (guild.members.length >= GAME_DEMO_CONFIG.guildCapacity)
                    throw { code: 'GAME_DEMO_GUILD_FULL', msg: '仙盟人数已满' }
                const view = { ...guild, members: [...guild.members, uid], revision: guild.revision + 1 }
                await tx.set(this.guilds, JSON.stringify([sid, guild.id]), {
                    schemaVersion: 1,
                    revision: view.revision,
                    view,
                })
                await tx.set(this.memberships, JSON.stringify([sid, uid]), {
                    ...member,
                    revision: member.revision + 1,
                    guildId: guild.id,
                    invitations: [],
                })
            } else {
                await tx.set(this.memberships, JSON.stringify([sid, uid]), {
                    ...member,
                    revision: member.revision + 1,
                    invitations: member.invitations.filter((i) => i.id !== req.inviteId),
                })
            }
        })
    }
    async leave(uid: string, sid: number, req: IGameDemoGuildLeaveReq): Promise<IGameDemoGuildRes> {
        return this.run(uid, sid, 'leave', req, async (tx) => {
            const member = await this.member(tx, uid, sid)
            if (!member.guildId) return
            const record = await tx.get(this.guilds, JSON.stringify([sid, member.guildId]))
            const guild = record?.view
            if (!guild || !guild.members.includes(uid)) throw new Error('guild membership is inconsistent')
            const members = guild.members.filter((id) => id !== uid)
            const revision = guild.revision + 1
            const view = members.length
                ? { ...guild, members, owner: guild.owner === uid ? members[0] : guild.owner, revision }
                : null
            await tx.set(this.guilds, JSON.stringify([sid, guild.id]), { schemaVersion: 1, revision, view })
            await tx.set(this.memberships, JSON.stringify([sid, uid]), {
                ...member,
                revision: member.revision + 1,
                guildId: null,
                invitations: [],
            })
        })
    }
    private async run(
        uid: string,
        sid: number,
        kind: string,
        req: { clientReqId: string },
        action: (tx: AtomicHashTransaction) => Promise<void>,
    ): Promise<IGameDemoGuildRes> {
        const result = await this.operations.run(
            JSON.stringify([sid, uid, kind, req.clientReqId]),
            JSON.stringify(req),
            async (tx) => {
                await action(tx)
                return this.snapshot(tx, uid, sid)
            },
        )
        return validateGameDemoGuildRes(result)
    }
    private async member(tx: AtomicHashTransaction, uid: string, sid: number): Promise<Membership> {
        const m = await tx.get(this.memberships, JSON.stringify([sid, uid]))
        return m
            ? { ...m, invitations: m.invitations.map((i) => ({ ...i })) }
            : { schemaVersion: 1, revision: 0, guildId: null, invitations: [] }
    }
    private async validInvitations(
        tx: AtomicHashTransaction,
        sid: number,
        member: Membership,
    ): Promise<GameDemoGuildInvite[]> {
        const result: GameDemoGuildInvite[] = []
        for (const invite of member.invitations) {
            const guild = (await tx.get(this.guilds, JSON.stringify([sid, invite.guildId])))?.view
            if (guild && guild.owner === invite.inviter) result.push(invite)
        }
        return result
    }
    private async snapshot(tx: AtomicHashTransaction, uid: string, sid: number): Promise<IGameDemoGuildRes> {
        const member = await this.member(tx, uid, sid)
        const record = member.guildId ? await tx.get(this.guilds, JSON.stringify([sid, member.guildId])) : undefined
        const guild = record?.view ? validateGameDemoGuild(record.view) : null
        if (member.guildId && (!guild || !guild.members.includes(uid)))
            throw new Error('guild membership is inconsistent')
        return {
            uid,
            revision: member.revision,
            guild,
            invitations: guild ? [] : await this.validInvitations(tx, sid, member),
        }
    }
}
