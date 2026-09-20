import { RedisInstance } from '@arthropoda/game-engine'
import type {
    IRoomPrepareCreateReq,
    IRoomPrepareCreateRes,
    IRoomResolveRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import { isRoomProfileDeclared, resolveInviteRoomTarget } from './RoomGameplayCatalog'
import {
    INVITE_MAX_ROOMS_PER_UID,
    ISSUE_CREATION_TICKET_SCRIPT,
    ROOM_TICKET_QUOTA_TTL_MS,
    ROOM_TICKET_TTL_MS,
    accessTicketHash,
    newAccessTicket,
    newTicketJti,
    roomInviteCodeKey,
    roomTicketKey,
    roomTicketQuotaKey,
    type RoomCreationTicketRecord,
    type RoomInviteLeaseView,
    type RoomJoinTicketRecord,
} from './RoomInviteContract'

/**
 * Colyseus RedisDriver 的房间缓存键。`@colyseus/redis-driver` 用的**固定字面量**（不带项目前缀），
 * 所以这里 ⛔ 不能加 `ROOM_INVITE_KEY_PREFIX`——加了就永远读不到。
 */
const COLYSEUS_ROOM_CACHE_KEY = 'roomcaches'

/** Colyseus 房间缓存里 resolve 需要的那几个字段（`IRoomCache` 的子集）。 */
interface RoomCacheSnapshot {
    readonly locked?: unknown
    readonly clients?: unknown
    readonly maxClients?: unknown
}

/**
 * 私房 creation ticket 与邀请码租约的 Lobby 侧读写面。
 *
 * 存储契约（键族 / 记录形状 / 配额成员 / 过期语义）全部由 `RoomInviteContract` 定义，且与
 * GameRoom 侧（未迁移的 `apps/server`）**共用同一份**：本 store 只签发 creation ticket、
 * 读邀请码租约、签发 join ticket——**不**消费票据、**不**分配邀请码，那两件事的写入方是
 * GameRoom（`AccessTicket.claimCreation` / `InviteCodeReservation.allocate`），迁移期间不复制过来。
 *
 * **⛔ 本 store 不实现幂等**：`room.prepareCreate` 归 idempotent-write，`clientReqId` 进通用幂等闸
 * （契约抬头：creation ticket 的 jti 状态机建立在通用幂等层之上，不另起一套）。此前这里按
 * `${sId}:${uid}:${clientReqId}` 自建过一份回执表，等于在通用闸之上又叠一层语义不同的幂等——
 * 两层对「什么算同一次请求」的判定可以分歧，已删除，⛔ 不要再加回来。
 */
export class RoomNativeLobbyStore {
    /** 目录闸 + 配额原子检查 + 签发绑定 uid/sId/mode/modeVersion/profile 的 creation ticket。 */
    async prepare(uid: string, sId: number, req: IRoomPrepareCreateReq): Promise<IRoomPrepareCreateRes> {
        const target = resolveInviteRoomTarget(req.mode, req.profile, req.modeVersion)
        const expiresAt = Date.now() + ROOM_TICKET_TTL_MS
        const ticket = newAccessTicket()
        const record: RoomCreationTicketRecord = {
            v: 1,
            purpose: 'create',
            state: 'issued',
            uid,
            sId,
            mode: target.mode,
            modeVersion: target.modeVersion,
            profile: target.profile,
            jti: newTicketJti(),
            exp: expiresAt,
        }
        let reply: unknown
        try {
            reply = await RedisInstance.getCenterRedis()
                .client()
                .eval(ISSUE_CREATION_TICKET_SCRIPT, {
                    keys: [roomTicketQuotaKey(sId, uid), roomTicketKey(sId, accessTicketHash(ticket))],
                    arguments: [
                        String(INVITE_MAX_ROOMS_PER_UID),
                        String(ROOM_TICKET_TTL_MS),
                        record.jti,
                        JSON.stringify(record),
                        String(ROOM_TICKET_QUOTA_TTL_MS),
                    ],
                })
        } catch {
            // 单条 Lua 可能已落盘也可能没有：结果未知（重试安全——旧 ticket 随 exp 自然回收，
            // 配额成员同样按 score 剪除）。⛔ 不降级为确定性拒绝。
            throw roomFault('ROOM_RESULT_UNKNOWN', '私房服务暂不可用，请稍后重试')
        }
        const verdict = Array.isArray(reply) ? reply[0] : undefined
        if (verdict === 'quota') throw roomFault('ROOM_QUOTA_EXCEEDED', '同时开启的私房数量已达上限')
        if (verdict !== 'ok') {
            // `dup`（sha256 撞已有记录）是不可能事件；其余取值是脚本与契约漂移。
            // 两者都**没有**留下可用的 ticket，所以按可重试的未知结果返回，⛔ 不假装成功。
            throw roomFault('ROOM_RESULT_UNKNOWN', '私房服务暂不可用，请稍后重试')
        }
        return { creationTicket: ticket, expiresAt }
    }

    /** 邀请码 → roomId + join ticket（区内定位；最终权威检查仍在 GameRoom admission）。 */
    async resolve(uid: string, sId: number, code: string): Promise<IRoomResolveRes> {
        const lease = await this.readLease(sId, code)
        await this.assertJoinable(lease.roomId)
        return this.issueJoinTicket(uid, sId, code, lease)
    }

    /**
     * 读六位码的 active 租约（**GameRoom 写、本侧只读**）。
     *
     * 折叠类（码不存在 / 墓碑隔离期 / 记录腐坏 / 区不匹配 / 目录已不再声明该 mode·profile）共用
     * 同一个码、同一段文案，**响应字节完全相同**，且不回显客户端给的 code——⛔ 不把 resolve
     * 变成存在性预言机。基础设施失败向上抛可重试的 `ROOM_SERVICE_UNAVAILABLE`，
     * ⛔ 绝不降级成「码不存在」这类确定性结论。
     */
    private async readLease(sId: number, code: string): Promise<RoomInviteLeaseView> {
        let raw: string | null
        try {
            raw = await RedisInstance.getCenterRedis().get(roomInviteCodeKey(sId, code))
        } catch {
            throw roomFault('ROOM_SERVICE_UNAVAILABLE', '私房服务暂不可用，请稍后重试')
        }
        if (raw === null) throw unavailable()
        let parsed: unknown
        try {
            parsed = JSON.parse(raw)
        } catch {
            // 存储腐坏与「码不存在」同属折叠类：不能因为读不出记录就泄露「这里本来有房间」。
            throw unavailable()
        }
        if (parsed === null || typeof parsed !== 'object') throw unavailable()
        const value = parsed as Record<string, unknown>
        if (value.v !== 1 || value.state !== 'active') throw unavailable()
        if (
            typeof value.roomId !== 'string' ||
            typeof value.mode !== 'string' ||
            typeof value.profile !== 'string' ||
            typeof value.modeVersion !== 'number' ||
            typeof value.sId !== 'number' ||
            typeof value.generation !== 'number'
        ) {
            throw unavailable()
        }
        if (value.sId !== sId) throw unavailable()
        // 目录已不再声明该组合（玩法下线 / profile 改名）与「码不存在」同属折叠类。
        if (!isRoomProfileDeclared(value.mode, value.profile)) throw unavailable()
        return {
            roomId: value.roomId,
            mode: value.mode,
            modeVersion: value.modeVersion,
            profile: value.profile,
            sId: value.sId,
            generation: value.generation,
        }
    }

    /**
     * 容量 / 开局快照（**best-effort UX**）。
     *
     * 契约（`domains/room.ts`）明确：resolve 不预留座位，容量与 phase 只能作为最佳努力快照，
     * 真正权威是 GameRoom 的原子 admission；快照读不到时**跳过**，⛔ 不改变结论。GameRoom 侧
     * `privateRoomRpc.ts` 对 listing 读失败的处理完全相同（「listing 快照失败不是权威结论的一部分」）。
     *
     * ⚠ 数据源是 Colyseus RedisDriver 的房间缓存。当前 `apps/server/app.config.ts` 未启用
     * RedisDriver（LocalDriver = 进程内内存），所以该拓扑下这里恒为「读不到」→ 跳过快照，
     * `ROOM_FULL` / `ROOM_START_IN_PROGRESS` 不会从 Lobby 侧发出。部署启用 RedisDriver 后
     * 本接缝自动生效，无需再改代码——这不是占位实现，而是契约允许的「无快照源即跳过」。
     */
    private async assertJoinable(roomId: string): Promise<void> {
        const listing = await this.roomListing(roomId)
        if (!listing) return
        if (listing.locked === true) throw roomFault('ROOM_START_IN_PROGRESS', '开局中，请稍后重试')
        const { clients, maxClients } = listing
        if (typeof clients === 'number' && typeof maxClients === 'number' && clients >= maxClients) {
            throw roomFault('ROOM_FULL', '房间已满')
        }
    }

    private async roomListing(roomId: string): Promise<RoomCacheSnapshot | null> {
        let raw: string | null | undefined
        try {
            raw = await RedisInstance.getCenterRedis().hGet(COLYSEUS_ROOM_CACHE_KEY, roomId)
        } catch {
            return null
        }
        if (!raw) return null
        try {
            const parsed: unknown = JSON.parse(raw)
            return parsed !== null && typeof parsed === 'object' ? (parsed as RoomCacheSnapshot) : null
        } catch {
            return null
        }
    }

    /** 签发 join ticket（绑定 uid/sId/roomId/mode/modeVersion/profile/code/租约 generation）。 */
    private async issueJoinTicket(
        uid: string,
        sId: number,
        code: string,
        lease: RoomInviteLeaseView,
    ): Promise<IRoomResolveRes> {
        const expiresAt = Date.now() + ROOM_TICKET_TTL_MS
        const ticket = newAccessTicket()
        const record: RoomJoinTicketRecord = {
            v: 1,
            purpose: 'join',
            state: 'issued',
            uid,
            sId,
            roomId: lease.roomId,
            mode: lease.mode,
            modeVersion: lease.modeVersion,
            profile: lease.profile,
            code,
            generation: lease.generation,
            jti: newTicketJti(),
            exp: expiresAt,
        }
        try {
            await RedisInstance.getCenterRedis()
                .client()
                .set(roomTicketKey(sId, accessTicketHash(ticket)), JSON.stringify(record), {
                    PX: ROOM_TICKET_TTL_MS,
                })
        } catch {
            throw roomFault('ROOM_SERVICE_UNAVAILABLE', '私房服务暂不可用，请稍后重试')
        }
        return {
            roomId: lease.roomId,
            mode: lease.mode,
            modeVersion: lease.modeVersion,
            profile: lease.profile,
            joinTicket: ticket,
            expiresAt,
        }
    }
}

/** 折叠类的**唯一**构造点：多种内部原因共用同一 code + 同一文案（响应字节逐对相同）。 */
function unavailable(): { code: string; msg: string } {
    return { code: 'ROOM_CODE_UNAVAILABLE', msg: '邀请码不可用' }
}

function roomFault(code: string, msg: string): { code: string; msg: string } {
    return { code, msg }
}
