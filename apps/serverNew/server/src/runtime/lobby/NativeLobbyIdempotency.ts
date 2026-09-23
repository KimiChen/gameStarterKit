import { createHash } from 'node:crypto'
import { RedisInstance } from '@arthropoda/game-engine'
import { canonicalJsonString } from '../../../generated/lobby-contract/native/lobbyRpc/index.generated'

/** 幂等记录形态（Non-intrusive §6.12）；`done-oversize` 是「确定执行过、结果不可得」的墓碑。 */
type StoredIdemRecord =
    | {
          readonly v: 2
          readonly state: 'pending'
          readonly hash: string
          readonly leaseId: string
          readonly contractVersion: number
      }
    | {
          readonly v: 2
          readonly state: 'done'
          readonly hash: string
          readonly resultJson: string
          readonly contractVersion: number
      }
    | { readonly v: 2; readonly state: 'done-oversize'; readonly hash: string; readonly contractVersion: number }

/** 通用幂等只依赖 `EVAL`；注入面刻意收窄，便于用假体覆盖并发与过期窗口。 */
export interface NativeLobbyIdempotencyRedis {
    eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>
}

export interface NativeLobbyIdempotencyLimits {
    /** pending 租约；必须大于 handler 实测时长，否则会出现孤儿 lease。 */
    readonly pendingTtlMs: number
    /** done 结果缓存窗口；窗口过后重试会重新执行 handler。 */
    readonly resultTtlMs: number
    /** 结果体上限，超限改写 `done-oversize` 墓碑。 */
    readonly resultMaxBytes: number
    /** 同一 uid 同时存在的 pending 上限，超限返回 `BUSY`。 */
    readonly maxPendingPerUser: number
}

export const NATIVE_LOBBY_IDEMPOTENCY_LIMITS: NativeLobbyIdempotencyLimits = {
    pendingTtlMs: 30_000,
    resultTtlMs: 60_000,
    // 传输层上限 64 KiB；留出 envelope 余量，超过它的响应本就不该走通用结果缓存。
    resultMaxBytes: 60 * 1024,
    maxPendingPerUser: 8,
}

export interface NativeLobbyIdempotencyRun<Res> {
    readonly route: string
    readonly uid: string
    readonly sId: number
    readonly clientReqId: string
    readonly payload: unknown
    readonly contractVersion: number
    readonly execute: () => Promise<unknown>
    /** 出站响应契约校验；缓存重放同样必须过它，否则把服务端缺陷伪装成成功。 */
    readonly validate: (route: string, result: unknown) => Res
}

/** 摘要 preimage 固定算法版本，且必须包含 route；`clientReqId` 已在 key 末段，不进 preimage。 */
const HASH_ALGORITHM_VERSION = 'lobby-rpc-idem/v1'

export function lobbyIdempotencyHash(route: string, payload: unknown): string {
    // 显式删除而不是 `_` 前缀解构，避免与命名规则冲突。
    const businessPayload: Record<string, unknown> = { ...((payload ?? {}) as Record<string, unknown>) }
    delete businessPayload.clientReqId
    return createHash('sha256')
        .update(`${HASH_ALGORITHM_VERSION}\u0000${route}\u0000${canonicalJsonString(businessPayload)}`, 'utf8')
        .digest('hex')
}

/**
 * 通用幂等闸：payload 绑定 + 唯一 lease + CAS 完成。
 *
 * 它只是 30/60 秒量级的 UX 快闸，不是 exactly-once 真源——领域收据仍是权威，
 * 因此这里既不回滚业务提交，也不把 lease 竞争当成「未执行」。
 */
export class NativeLobbyIdempotency {
    private readonly limits: NativeLobbyIdempotencyLimits

    constructor(
        private readonly redis: () => NativeLobbyIdempotencyRedis = defaultRedis,
        limits: Partial<NativeLobbyIdempotencyLimits> = {},
    ) {
        this.limits = { ...NATIVE_LOBBY_IDEMPOTENCY_LIMITS, ...limits }
    }

    async run<Res>(input: NativeLobbyIdempotencyRun<Res>): Promise<Res> {
        const hash = lobbyIdempotencyHash(input.route, input.payload)
        const recordKey = recordKeyOf(input.route, input.uid, input.sId, input.clientReqId)
        const pendingKey = pendingKeyOf(input.uid, input.sId)
        const leaseId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
        const pendingRecord: StoredIdemRecord = {
            v: 2,
            state: 'pending',
            hash,
            leaseId,
            contractVersion: input.contractVersion,
        }

        const acquired = await this.acquire(recordKey, pendingKey, {
            hash,
            leaseId,
            contractVersion: input.contractVersion,
            member: recordKey,
            pendingRecord,
        })

        switch (acquired.kind) {
            case 'conflict':
                throw businessError('OPERATION_CONFLICT', '幂等请求参数不一致')
            case 'in_progress':
                throw businessError('IN_PROGRESS', '请求正在处理中')
            case 'busy':
                throw businessError('BUSY', '并发请求过多，请稍后重试')
            case 'expired':
                throw businessError('OPERATION_RESULT_EXPIRED', '操作结果已过期，请通过领域查询恢复')
            case 'done':
                // 重放同样要过响应契约；重校验失败按服务端缺陷返回 INTERNAL 且不删除记录。
                return input.validate(input.route, parseCached(acquired.resultJson))
            case 'acquired':
                break
            default:
                throw businessError('INTERNAL', '幂等记录不可用')
        }

        let result: Res
        try {
            result = input.validate(input.route, await input.execute())
        } catch (error) {
            await this.release(recordKey, pendingKey, leaseId, recordKey)
            throw error
        }

        const completed = await this.complete(recordKey, pendingKey, {
            leaseId,
            member: recordKey,
            resultJson: JSON.stringify(result),
        })
        if (!completed) {
            // 业务提交已经发生但 lease 已换代/过期：不回滚，也不伪装成成功。
            throw businessError('IN_PROGRESS', '请求正在处理中')
        }
        return result
    }

    private async acquire(
        recordKey: string,
        pendingKey: string,
        input: {
            readonly hash: string
            readonly leaseId: string
            readonly contractVersion: number
            readonly member: string
            readonly pendingRecord: StoredIdemRecord
        },
    ): Promise<
        | { readonly kind: 'acquired' }
        | { readonly kind: 'conflict' | 'in_progress' | 'busy' | 'expired' }
        | { readonly kind: 'done'; readonly resultJson: string }
    > {
        const reply = await this.eval(
            ACQUIRE_SCRIPT,
            [recordKey, pendingKey],
            [
                String(Date.now()),
                String(this.limits.pendingTtlMs),
                String(this.limits.maxPendingPerUser),
                input.member,
                JSON.stringify(input.pendingRecord),
                input.hash,
                String(input.contractVersion),
            ],
        )
        const [status, payload] = asReply(reply)
        if (status === 'done' && typeof payload === 'string') return { kind: 'done', resultJson: payload }
        if (status === 'acquired') return { kind: 'acquired' }
        if (status === 'conflict' || status === 'in_progress' || status === 'busy' || status === 'expired') {
            return { kind: status }
        }
        throw businessError('INTERNAL', '幂等记录不可用')
    }

    private async complete(
        recordKey: string,
        pendingKey: string,
        input: { readonly leaseId: string; readonly member: string; readonly resultJson: string },
    ): Promise<boolean> {
        const reply = await this.eval(
            COMPLETE_SCRIPT,
            [recordKey, pendingKey],
            [
                input.leaseId,
                input.resultJson,
                String(this.limits.resultMaxBytes),
                String(this.limits.resultTtlMs),
                input.member,
            ],
        )
        return Number(reply) === 1
    }

    private async release(recordKey: string, pendingKey: string, leaseId: string, member: string): Promise<void> {
        await this.eval(RELEASE_SCRIPT, [recordKey, pendingKey], [leaseId, member])
    }

    private async eval(script: string, keys: string[], args: string[]): Promise<unknown> {
        return this.redis().eval(script, { keys, arguments: args })
    }
}

/** 单条 Lua 完成「过期清理 → 冲突判定 → 契约版本 fail-closed → 原子占位」。 */
const ACQUIRE_SCRIPT = `
local recordKey = KEYS[1]
local pendingKey = KEYS[2]
local now = tonumber(ARGV[1])
local pendingTtl = tonumber(ARGV[2])
local maxPending = tonumber(ARGV[3])
local member = ARGV[4]
local pendingJson = ARGV[5]
local hash = ARGV[6]
local contractVersion = tonumber(ARGV[7])

redis.call('ZREMRANGEBYSCORE', pendingKey, '-inf', now)

local raw = redis.call('GET', recordKey)
if raw then
  local ok, record = pcall(cjson.decode, raw)
  if not ok then return {'corrupt'} end
  if record.hash ~= hash then return {'conflict'} end
  if record.contractVersion ~= contractVersion then
    if record.state == 'pending' then return {'in_progress'} end
    return {'expired'}
  end
  if record.state == 'pending' then return {'in_progress'} end
  if record.state == 'done-oversize' then return {'expired'} end
  return {'done', record.resultJson}
end

if redis.call('ZCARD', pendingKey) >= maxPending then return {'busy'} end

redis.call('SET', recordKey, pendingJson, 'PX', pendingTtl)
redis.call('ZADD', pendingKey, now + pendingTtl, member)
redis.call('PEXPIRE', pendingKey, pendingTtl)
return {'acquired'}
`

/** CAS 完成：只有仍持有 lease 的 pending 才能提升为 done，并重置为结果 TTL。 */
const COMPLETE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local ok, record = pcall(cjson.decode, raw)
if not ok then return 0 end
if record.state ~= 'pending' or record.leaseId ~= ARGV[1] then return 0 end
local resultJson = ARGV[2]
local maxBytes = tonumber(ARGV[3])
local resultTtl = tonumber(ARGV[4])
local next
if string.len(resultJson) > maxBytes then
  next = { v = 2, state = 'done-oversize', hash = record.hash, contractVersion = record.contractVersion }
else
  next = { v = 2, state = 'done', hash = record.hash, resultJson = resultJson, contractVersion = record.contractVersion }
end
redis.call('SET', KEYS[1], cjson.encode(next), 'PX', resultTtl)
redis.call('ZREM', KEYS[2], ARGV[5])
return 1
`

/** 失败释放只删自己的 pending，绝不删除后来者的占位。 */
const RELEASE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if raw then
  local ok, record = pcall(cjson.decode, raw)
  if ok and record.state == 'pending' and record.leaseId == ARGV[1] then
    redis.call('DEL', KEYS[1])
  end
end
redis.call('ZREM', KEYS[2], ARGV[2])
return 1
`

function recordKeyOf(route: string, uid: string, sId: number, clientReqId: string): string {
    // clientReqId 固定位于末段：同一 (sId, uid, route) 下不同 ID 必得不同 key。
    return `nativeLobby:idem:v1:{${sId}:${uid}}:${route}:${clientReqId}`
}

function pendingKeyOf(uid: string, sId: number): string {
    return `nativeLobby:idem:pending:v1:{${sId}:${uid}}`
}

function defaultRedis(): NativeLobbyIdempotencyRedis {
    return RedisInstance.getCenterRedis().client()
}

function asReply(reply: unknown): [string, unknown] {
    if (!Array.isArray(reply) || typeof reply[0] !== 'string') return ['corrupt', undefined]
    return [reply[0], reply[1]]
}

function parseCached(resultJson: string): unknown {
    try {
        return JSON.parse(resultJson)
    } catch {
        throw businessError('INTERNAL', '幂等结果不可用')
    }
}

function businessError(code: string, msg: string): { code: string; msg: string } {
    return { code, msg }
}
