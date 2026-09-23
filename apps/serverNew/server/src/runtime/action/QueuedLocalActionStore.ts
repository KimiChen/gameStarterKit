import { RedisInstance } from '@arthropoda/game-engine'

export type QueuedLocalActionState = 'pending' | 'running' | 'done' | 'failed'

export interface QueuedLocalActionRecord {
    readonly version: 2
    readonly taskId: string
    readonly fingerprint: string
    readonly apiName: string
    readonly uId: number
    readonly sId: number
    readonly req: unknown
    readonly createdAt: number
    availableAt: number
    attempts: number
    state: QueuedLocalActionState
    leaseOwner?: string
    leaseUntil?: number
    updatedAt?: number
    completedAt?: number
    failedAt?: number
    lastError?: string
}

const ENQUEUE_SCRIPT = `
-- queued-local-action-enqueue-v2
local existing = redis.call('HGET', KEYS[1], ARGV[1])
if existing then
    local ok, record = pcall(cjson.decode, existing)
    if not ok or record.fingerprint ~= ARGV[2] then
        return {'conflict', existing}
    end
    return {'existing', existing}
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
redis.call('ZADD', KEYS[2], ARGV[4], ARGV[1])
return {'enqueued', ARGV[3]}
`

const CLAIM_SCRIPT = `
-- queued-local-action-claim-v2
local tasks = KEYS[1]
local ready = KEYS[2]
local inflight = KEYS[3]
local failed = KEYS[4]
local legacy = KEYS[5]
local readyNow = tonumber(ARGV[1])
local leaseNow = tonumber(ARGV[2])
local leaseUntil = tonumber(ARGV[3])
local owner = ARGV[4]
local maxAttempts = tonumber(ARGV[5])

local function storeFailed(taskId, record, reason)
    record.state = 'failed'
    record.failedAt = readyNow
    record.updatedAt = readyNow
    record.lastError = reason
    record.leaseOwner = nil
    record.leaseUntil = nil
    redis.call('HSET', tasks, taskId, cjson.encode(record))
    redis.call('ZADD', failed, readyNow, taskId)
end

local function decodeRecord(taskId, raw)
    local ok, record = pcall(cjson.decode, raw)
    if ok and type(record) == 'table' then return record end
    storeFailed(taskId, {version = 2, taskId = taskId, attempts = maxAttempts}, 'corrupt task record')
    return nil
end

local function claim(taskId, record)
    record.attempts = tonumber(record.attempts or 0) + 1
    record.state = 'running'
    record.leaseOwner = owner
    record.leaseUntil = leaseUntil
    record.updatedAt = readyNow
    redis.call('HSET', tasks, taskId, cjson.encode(record))
    redis.call('ZREM', ready, taskId)
    redis.call('ZADD', inflight, leaseUntil, taskId)
    return cjson.encode(record)
end

for _ = 1, 32 do
    local expired = redis.call('ZRANGEBYSCORE', inflight, '-inf', leaseNow, 'LIMIT', 0, 1)
    if #expired == 0 then break end
    local taskId = expired[1]
    redis.call('ZREM', inflight, taskId)
    local raw = redis.call('HGET', tasks, taskId)
    if raw then
        local record = decodeRecord(taskId, raw)
        if record and record.state == 'running' then
            if tonumber(record.attempts or 0) >= maxAttempts then
                storeFailed(taskId, record, 'execution lease expired after final attempt')
            else
                return claim(taskId, record)
            end
        end
    end
end

for _ = 1, 32 do
    local due = redis.call('ZRANGEBYSCORE', ready, '-inf', readyNow, 'LIMIT', 0, 1)
    if #due == 0 then break end
    local taskId = due[1]
    redis.call('ZREM', ready, taskId)
    local raw = redis.call('HGET', tasks, taskId)
    if raw then
        local record = decodeRecord(taskId, raw)
        if record and record.state == 'pending' then return claim(taskId, record) end
    end
end

local legacyDue = redis.call('ZRANGEBYSCORE', legacy, '-inf', readyNow, 'WITHSCORES', 'LIMIT', 0, 1)
if #legacyDue >= 2 then
    local raw = legacyDue[1]
    redis.call('ZREM', legacy, raw)
    local ok, item = pcall(cjson.decode, raw)
    if ok and type(item) == 'table' then
        local taskId = ARGV[6]
        local record = {
            version = 2,
            taskId = taskId,
            fingerprint = ARGV[7],
            apiName = item.apiName,
            uId = tonumber(item.uId or 0),
            sId = tonumber(item.sId or 0),
            req = item.req,
            createdAt = tonumber(ARGV[8]),
            availableAt = tonumber(legacyDue[2]),
            attempts = 0,
            state = 'pending'
        }
        redis.call('HSET', tasks, taskId, cjson.encode(record))
        return claim(taskId, record)
    end
    storeFailed(ARGV[6], {version = 2, taskId = ARGV[6], attempts = maxAttempts}, 'corrupt legacy task record')
end
return nil
`

const ACK_SCRIPT = `
-- queued-local-action-ack-v2
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return 0 end
local ok, record = pcall(cjson.decode, raw)
if not ok or record.state ~= 'running' or record.leaseOwner ~= ARGV[2] then return 0 end
record.state = 'done'
record.completedAt = tonumber(ARGV[3])
record.updatedAt = tonumber(ARGV[3])
record.leaseOwner = nil
record.leaseUntil = nil
redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(record))
redis.call('ZREM', KEYS[2], ARGV[1])
return 1
`

const FAIL_SCRIPT = `
-- queued-local-action-fail-v2
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return 'lost' end
local ok, record = pcall(cjson.decode, raw)
if not ok or record.state ~= 'running' or record.leaseOwner ~= ARGV[2] then return 'lost' end
local now = tonumber(ARGV[3])
local maxAttempts = tonumber(ARGV[5])
redis.call('ZREM', KEYS[3], ARGV[1])
record.lastError = ARGV[4]
record.updatedAt = now
record.leaseOwner = nil
record.leaseUntil = nil
if tonumber(record.attempts or 0) < maxAttempts then
    record.state = 'pending'
    record.availableAt = now + tonumber(ARGV[6])
    redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(record))
    redis.call('ZADD', KEYS[2], record.availableAt, ARGV[1])
    return 'retry'
end
record.state = 'failed'
record.failedAt = now
redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(record))
redis.call('ZADD', KEYS[4], now, ARGV[1])
return 'failed'
`

const RENEW_SCRIPT = `
-- queued-local-action-renew-v2
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return 0 end
local ok, record = pcall(cjson.decode, raw)
if not ok or record.state ~= 'running' or record.leaseOwner ~= ARGV[2] then return 0 end
record.leaseUntil = tonumber(ARGV[3])
redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(record))
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[1])
return 1
`

const CANCEL_SCRIPT = `
-- queued-local-action-cancel-v2
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return 0 end
local ok, record = pcall(cjson.decode, raw)
if not ok or record.state ~= 'pending' then return 0 end
redis.call('HDEL', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
return 1
`

export class QueuedLocalActionStore {
    static readonly MAX_ATTEMPTS = 2
    static readonly RETRY_DELAY_SECONDS = 1
    static readonly LEASE_MS = 30_000

    static keys(sid: number) {
        const prefix = `game.localActionQueue:v2:${sid}`
        return {
            tasks: `${prefix}:tasks`,
            ready: `${prefix}:ready`,
            inflight: `${prefix}:inflight`,
            failed: `${prefix}:failed`,
            legacy: `game.localTimeQueue:${sid}`,
        }
    }

    static async enqueue(record: QueuedLocalActionRecord): Promise<'enqueued' | 'existing'> {
        const keys = this.keys(record.sId)
        const result = (await this.client().eval(ENQUEUE_SCRIPT, {
            keys: [keys.tasks, keys.ready],
            arguments: [record.taskId, record.fingerprint, JSON.stringify(record), String(record.availableAt)],
        })) as unknown[]
        const outcome = String(result?.[0] ?? '')
        if (outcome === 'enqueued' || outcome === 'existing') return outcome
        if (outcome === 'conflict') throw new Error(`queued local action taskId conflict: ${record.taskId}`)
        throw new Error(`queued local action enqueue returned invalid outcome: ${outcome}`)
    }

    static async claim(
        sid: number,
        owner: string,
        legacyTaskId: string,
        legacyFingerprint: string,
        readyNow: number,
        leaseNow = Date.now(),
    ): Promise<QueuedLocalActionRecord | undefined> {
        const keys = this.keys(sid)
        const raw = await this.client().eval(CLAIM_SCRIPT, {
            keys: [keys.tasks, keys.ready, keys.inflight, keys.failed, keys.legacy],
            arguments: [
                String(readyNow),
                String(leaseNow),
                String(leaseNow + this.LEASE_MS),
                owner,
                String(this.MAX_ATTEMPTS),
                legacyTaskId,
                legacyFingerprint,
                String(readyNow),
            ],
        })
        return typeof raw === 'string' ? (JSON.parse(raw) as QueuedLocalActionRecord) : undefined
    }

    static async ack(record: QueuedLocalActionRecord, owner: string, now: number): Promise<boolean> {
        const keys = this.keys(record.sId)
        const result = await this.client().eval(ACK_SCRIPT, {
            keys: [keys.tasks, keys.inflight],
            arguments: [record.taskId, owner, String(now)],
        })
        return Number(result) === 1
    }

    static async fail(
        record: QueuedLocalActionRecord,
        owner: string,
        error: unknown,
        now: number,
    ): Promise<'retry' | 'failed' | 'lost'> {
        const keys = this.keys(record.sId)
        const result = await this.client().eval(FAIL_SCRIPT, {
            keys: [keys.tasks, keys.ready, keys.inflight, keys.failed],
            arguments: [
                record.taskId,
                owner,
                String(now),
                this.errorMessage(error),
                String(this.MAX_ATTEMPTS),
                String(this.RETRY_DELAY_SECONDS),
            ],
        })
        const outcome = String(result)
        return outcome === 'retry' || outcome === 'failed' ? outcome : 'lost'
    }

    static async renew(record: QueuedLocalActionRecord, owner: string, leaseNow = Date.now()): Promise<boolean> {
        const keys = this.keys(record.sId)
        const result = await this.client().eval(RENEW_SCRIPT, {
            keys: [keys.tasks, keys.inflight],
            arguments: [record.taskId, owner, String(leaseNow + this.LEASE_MS)],
        })
        return Number(result) === 1
    }

    static async cancel(taskId: string, sid: number): Promise<boolean> {
        const keys = this.keys(sid)
        const result = await this.client().eval(CANCEL_SCRIPT, {
            keys: [keys.tasks, keys.ready],
            arguments: [taskId],
        })
        return Number(result) === 1
    }

    static async failed(sid: number, limit = 100): Promise<QueuedLocalActionRecord[]> {
        if (!Number.isInteger(limit) || limit <= 0) return []
        const redis = RedisInstance.getCenterRedis()
        const keys = this.keys(sid)
        const taskIds = await redis.zRange(keys.failed, 0, Math.min(limit, 1000) - 1, true)
        if (taskIds.length === 0) return []
        const records = await redis.hmGetToMap(keys.tasks, taskIds)
        return taskIds.flatMap((value) => {
            const taskId = String(value)
            const raw = records[taskId]
            return raw ? [JSON.parse(raw) as QueuedLocalActionRecord] : []
        })
    }

    private static client() {
        return RedisInstance.getCenterRedis().client()
    }

    private static errorMessage(error: unknown): string {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        return message.slice(0, 1000)
    }
}
