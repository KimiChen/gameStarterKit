import { RedisInstance } from '@arthropoda/game-engine'
import type { LobbyConnectionContext } from '@arthropoda/game-engine'
import type {
    IGuildGetEventsReq,
    IGuildGetEventsRes,
    IGuildJoinReq,
    IGuildJoinRes,
    IGuildLeaveRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import { NativeLobbyUserStore } from '../../user/lobby/NativeLobbyUserStore'

const GUILD_IDS = new Set([1, 2, 3, 4])
const EVENT_LIMIT = 1000

interface GuildEvent {
    seq: number
    kind: string
    data: { uid: string }
    at: number
}

/** guild 需要的外部能力；只传能力，不把其它模块的实现类型暴露给模块描述符。 */
export interface GuildNativeLobbyDependencies {
    readonly registerCharacter: (uid: string, sId: number) => Promise<void>
    readonly pushToUser: (uid: string, sId: number, type: string, data: unknown) => Promise<boolean>
}

/** 公会目录、成员索引与 capped 事件流均按区服分桶，推送只是唤醒，事件列表是可恢复读面。 */
export class GuildNativeLobbyStore {
    private readonly users: NativeLobbyUserStore
    private readonly pushToUser: (uid: string, sId: number, type: string, data: unknown) => Promise<boolean>

    // 跨模块组合放在 store 内部：模块描述符只允许引用本模块内的实现。
    constructor(dependencies: GuildNativeLobbyDependencies) {
        this.users = new NativeLobbyUserStore(dependencies.registerCharacter)
        this.pushToUser = dependencies.pushToUser
    }

    async join(context: LobbyConnectionContext, request: IGuildJoinReq): Promise<IGuildJoinRes> {
        if (!GUILD_IDS.has(request.guildId)) throw { code: 'INVALID_PAYLOAD', msg: '未知工会' }
        const current = await this.users.require(context.uid, context.sId)
        if (current.guildId === request.guildId)
            return { ok: true, seq: await this.latest(request.guildId, context.sId) }
        if (current.guildId > 0) await this.leaveGuild(context, current.guildId)
        await this.users.setGuildId(context.uid, context.sId, request.guildId)
        const redis = RedisInstance.getCenterRedis()
        await redis.sAdd(membersKey(context.sId, request.guildId), context.uid)
        const seq = await this.emit(context.sId, request.guildId, 'memberJoin', context.uid)
        await this.broadcast(context.sId, request.guildId, seq)
        return { ok: true, seq }
    }

    async leave(context: LobbyConnectionContext): Promise<IGuildLeaveRes> {
        const current = await this.users.require(context.uid, context.sId)
        if (current.guildId > 0) await this.leaveGuild(context, current.guildId)
        return { ok: true }
    }

    async events(context: LobbyConnectionContext, request: IGuildGetEventsReq): Promise<IGuildGetEventsRes> {
        const current = await this.users.require(context.uid, context.sId)
        if (!current.guildId) return { events: [], latestSeq: 0, guildId: 0 }
        const raw = await RedisInstance.getCenterRedis().lRange(eventsKey(context.sId, current.guildId), 0, -1)
        const events = raw
            .map(parseEvent)
            .filter((event): event is GuildEvent => event !== null)
            .filter((event) => event.seq > request.sinceSeq)
        return { events, latestSeq: await this.latest(current.guildId, context.sId), guildId: current.guildId }
    }

    private async leaveGuild(context: LobbyConnectionContext, guildId: number): Promise<void> {
        await this.users.setGuildId(context.uid, context.sId, 0)
        const redis = RedisInstance.getCenterRedis()
        await redis.sRem(membersKey(context.sId, guildId), context.uid)
        const seq = await this.emit(context.sId, guildId, 'memberLeave', context.uid)
        await this.broadcast(context.sId, guildId, seq)
    }

    private async emit(sId: number, guildId: number, kind: string, uid: string): Promise<number> {
        const redis = RedisInstance.getCenterRedis()
        const seq = await redis.hIncrBy('nativeLobby:guild:seq:v1', `${sId}:${guildId}`, 1)
        const event: GuildEvent = { seq, kind, data: { uid }, at: Date.now() }
        await redis.rPush(eventsKey(sId, guildId), [JSON.stringify(event)])
        await redis.lTrim(eventsKey(sId, guildId), -EVENT_LIMIT, -1)
        return seq
    }

    private async latest(guildId: number, sId: number): Promise<number> {
        return Number((await RedisInstance.getCenterRedis().hGet('nativeLobby:guild:seq:v1', `${sId}:${guildId}`)) ?? 0)
    }

    private async broadcast(sId: number, guildId: number, seq: number): Promise<void> {
        const members = await RedisInstance.getCenterRedis().sMembers(membersKey(sId, guildId))
        await Promise.all(members.map((uid) => this.pushToUser(uid, sId, 'guild.event', { seq, guildId })))
    }
}

function membersKey(sId: number, guildId: number): string {
    return `nativeLobby:guild:members:v1:${sId}:${guildId}`
}
function eventsKey(sId: number, guildId: number): string {
    return `nativeLobby:guild:events:v1:${sId}:${guildId}`
}
function parseEvent(raw: string): GuildEvent | null {
    try {
        const value = JSON.parse(raw) as GuildEvent
        return Number.isSafeInteger(value.seq) && value.seq > 0 ? value : null
    } catch {
        return null
    }
}
