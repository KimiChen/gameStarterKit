import { createHash, randomBytes } from 'node:crypto'

/**
 * 私房 creation ticket / 邀请码租约的**跨进程存储契约**（Lobby ↔ GameRoom 唯一真源）。
 *
 * 迁移后的拓扑里 Lobby 与 GameRoom 是**两个进程**：Lobby 是 serverNew 的原生 WebSocket 入口，
 * GameRoom 仍是未迁移的 `apps/server`（Colyseus）。私房链路因此天然跨进程：
 *
 * ```text
 * room.prepareCreate（serverNew 签发 creation ticket）
 *   → GameRoom.onCreate 的 claimCreation 消费   （apps/server core/rooms/invite/AccessTicket.ts）
 *   → GameRoom 分配六位邀请码租约               （core/rooms/invite/InviteCodeReservation.ts）
 *   → room.resolve（serverNew 读同一份租约）
 *   → GameRoom 的 claimJoin 消费 join ticket
 * ```
 *
 * 键族 / 记录形状 / 配额成员命名 / 过期语义只要有一处不一致，私房就整条不可用。所以本文件
 * **逐字对齐** GameRoom 侧既有契约：键由 `core/infra/keys.ts` 构造、记录由 `AccessTicket.ts`
 * 写、原子段由 `core/rooms/invite/redisScripts.ts` 定义。⛔ 不要在 serverNew 另起一套
 * `nativeLobby:room:*`——那等于让两个进程各说各话，私房看起来"实现完了"却谁也接不上谁。
 *
 * 时钟：原子段内取 Redis `TIME`（与 GameRoom 的 Lua 一致），⛔ 不把 app 时钟传进 Lua 做判定。
 */

/** GameRoom 侧同源 env（`apps/server/src/core/infra/config.ts` 读同名变量）：两侧必须取到同一组值。 */
function sharedEnvInt(name: string, fallback: number): number {
    const raw = process.env[name]
    if (raw === undefined || raw === '') return fallback
    const value = Number(raw)
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error(`${name} 非法：「${raw}」——须为 ≥1 的整数（与 GameRoom 侧同一约束）`)
    }
    return value
}

/** 单 uid 同时持有的**未消费** creation ticket + 活跃私房总数上限。 */
export const INVITE_MAX_ROOMS_PER_UID = sharedEnvInt('INVITE_MAX_ROOMS_PER_UID', 2)
/** creation / join ticket 存活窗口（ms）。 */
export const ROOM_TICKET_TTL_MS = sharedEnvInt('ROOM_TICKET_TTL_MS', 30_000)
/** 私房等待视界（ms）：配额键 TTL 的兜底基数。 */
export const INVITE_WAITING_DEADLINE_MS = sharedEnvInt('INVITE_WAITING_DEADLINE_MS', 600_000)
/** 配额键 TTL 兜底：覆盖最长成员（活跃房 = 等待视界）+ 一个 ticket TTL 余量。 */
export const ROOM_TICKET_QUOTA_TTL_MS = INVITE_WAITING_DEADLINE_MS + ROOM_TICKET_TTL_MS

/**
 * 全部私房键的命名空间前缀（GameRoom 侧 `REDIS_KEY_PREFIX`）。
 *
 * 校验与默认值与 GameRoom 侧**同一套**：`PROJECT_ID` 会进 Redis 键名，放宽约束就是两套
 * 命名空间的注入面，所以非法值在模块加载期直接 throw（fail-fast，不静默退回默认值）。
 */
export const ROOM_INVITE_KEY_PREFIX = (() => {
    const raw = process.env.PROJECT_ID
    const value = raw === undefined || raw === '' ? 'gono' : raw
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(value)) {
        throw new Error(
            `PROJECT_ID 非法：「${value}」——须匹配 ^[a-z][a-z0-9_]{0,31}$（与 GameRoom 侧同一校验；它同时用作 Redis 键前缀）`,
        )
    }
    return `${value}_`
})()

/** 六位邀请码 → active 租约 STRING（JSON）。**GameRoom 写、Lobby 只读**。 */
export const roomInviteCodeKey = (sId: number, code: string): string =>
    `${ROOM_INVITE_KEY_PREFIX}room:code:{s${sId}:${code}}`

/** `(sId, code)` 的 generation 单调计数器；GameRoom 的分配器用（Lobby 不写）。 */
export const roomInviteCodeGenerationKey = (sId: number, code: string): string =>
    `${ROOM_INVITE_KEY_PREFIX}room:code:gen:{s${sId}:${code}}`

/** creation / join ticket 记录 STRING（JSON，PX=exp）。键名只含 sha256，⛔ 不含 ticket 原文。 */
export const roomTicketKey = (sId: number, ticketSha256: string): string =>
    `${ROOM_INVITE_KEY_PREFIX}room:ticket:s${sId}:${ticketSha256}`

/** 单 uid 私房配额 ZSET：member=`t:<jti>`（未消费 ticket）/`r:<roomId>`（活跃私房），score=过期 ms。
 *  两个成员前缀写在 Lua 与 GameRoom 的 `claimCreation` 里（置换语义成对），⛔ 不要另外导出常量。 */
export const roomTicketQuotaKey = (sId: number, uid: string): string =>
    `${ROOM_INVITE_KEY_PREFIX}room:quota:s${sId}:{${uid}}`

/** creation ticket 记录：GameRoom 的 `claimCreation` 按这些字段做完整 CAS 复验。 */
export interface RoomCreationTicketRecord {
    readonly v: 1
    readonly purpose: 'create'
    readonly state: 'issued'
    readonly uid: string
    /** 与 GameRoom 写下的记录同形：数值（Lua 侧用 `tostring` 比较，故数值/字符串都能过 CAS，
     * 但读取方 `readInviteLease` 要求 `typeof sId === 'number'`——形状必须照抄，⛔ 不要"顺手"改字符串）。 */
    readonly sId: number
    readonly mode: string
    readonly modeVersion: number
    readonly profile: string
    readonly jti: string
    readonly exp: number
}

/** join ticket 记录：GameRoom 的 `claimJoin` 逐字段比对（含 `code` 与租约 `generation`）。 */
export interface RoomJoinTicketRecord {
    readonly v: 1
    readonly purpose: 'join'
    readonly state: 'issued'
    readonly uid: string
    readonly sId: number
    readonly roomId: string
    readonly mode: string
    readonly modeVersion: number
    readonly profile: string
    readonly code: string
    readonly generation: number
    readonly jti: string
    readonly exp: number
}

/** resolve 读到的 active 租约视图（⛔ 不含 `leaseToken`——读方永远拿不到能力凭证）。 */
export interface RoomInviteLeaseView {
    readonly roomId: string
    readonly mode: string
    readonly modeVersion: number
    readonly profile: string
    readonly sId: number
    readonly generation: number
}

/** 不透明 ticket：256bit base64url（与 GameRoom 的 `newAccessTicket` 同形同强度）。 */
export const newAccessTicket = (): string => randomBytes(32).toString('base64url')

/** 安全随机 jti（记录 / 配额成员标识；不等于 ticket 本身）。 */
export const newTicketJti = (): string => randomBytes(16).toString('hex')

/** 服务端只按 sha256 寻址 / 存储 ticket（原文不落 Redis key、不进日志）。 */
export const accessTicketHash = (ticket: string): string => createHash('sha256').update(ticket, 'utf8').digest('hex')

/**
 * creation ticket 的配额原子检查 + 签发。
 *
 * **逐字对齐** GameRoom 侧 `TICKET_ISSUE_CREATION`（`core/rooms/invite/redisScripts.ts`）：
 * 两边同时改才算契约变更。语义要点——过期配额成员先按 score 剪除；未消费 ticket 计入配额并随
 * exp 自然回收；`t:<jti>` 成员让 GameRoom 的 `claimCreation` 能把它置换为 `r:<roomId>`。
 *
 * KEYS=[quota, ticket] ARGV=[maxPerUid, ticketTtlMs, jti, recordJson, quotaTtlMs]
 * 返回 ['quota'] | ['dup'] | ['ok']
 */
export const ISSUE_CREATION_TICKET_SCRIPT = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[1]) then return { 'quota' } end
if redis.call('EXISTS', KEYS[2]) == 1 then return { 'dup' } end
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), 't:' .. ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[5])
redis.call('SET', KEYS[2], ARGV[4], 'PX', ARGV[2])
return { 'ok' }
`
