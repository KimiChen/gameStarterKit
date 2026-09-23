import { RedisCache } from '../database/RedisCache'
import { RedisInstance } from '../database/RedisInstance'

type AtomicInput<T> = [T][T extends unknown ? 0 : never]

export type AtomicReadonly<T> = T extends object ? { readonly [K in keyof T]: AtomicReadonly<T[K]> } : T

/** A codec is part of the persisted contract. Invalid historical data must fail closed. */
export interface AtomicHashCodec<T> {
    encode(value: T): string
    decode(raw: string): T
}

export const atomicStringCodec: AtomicHashCodec<string> = {
    encode(value) {
        if (typeof value !== 'string') throw new Error('invalid atomic string')
        return value
    },
    decode(raw) { return raw },
}

export const atomicCounterCodec: AtomicHashCodec<number> = {
    encode(value) {
        if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid atomic counter')
        return String(value)
    },
    decode(raw) {
        const value = Number(raw)
        if (!/^(0|[1-9][0-9]*)$/.test(raw) || !Number.isSafeInteger(value)) throw new Error('corrupt atomic counter')
        return value
    },
}

export function atomicJsonCodec<T>(validate: (value: unknown) => value is T): AtomicHashCodec<T> {
    return {
        encode(value) {
            if (!validate(value)) throw new Error('invalid atomic hash value')
            const raw = JSON.stringify(value)
            // Validate the actual persisted representation, not only the caller's object.
            if (raw === undefined || !validate(JSON.parse(raw))) throw new Error('invalid atomic hash JSON')
            return raw
        },
        decode(raw) {
            const value: unknown = JSON.parse(raw)
            if (!validate(value)) throw new Error('corrupt atomic hash value')
            return value
        },
    }
}

export type AtomicHashWriteGuard = (tx: AtomicHashTransaction) => Promise<void>

interface HashBinding<T> {
    guard?: AtomicHashWriteGuard
    key: string
    redis: RedisCache
    codec: AtomicHashCodec<T>
}
const bindings = new WeakMap<object, HashBinding<unknown>>()

/**
 * Typed hash fields with explicit conditional commits. This is deliberately not a RootBean:
 * it preserves existing scalar/JSON hash formats and must not share fields with deferred Bean saves.
 * No command client or arbitrary script is exposed to consumers.
 */
export class AtomicHash<T> {
    constructor(key: string, codec: AtomicHashCodec<T>, redis = RedisInstance.getCenterRedis(), guard?: AtomicHashWriteGuard) {
        if (!key || !redis) throw new Error('atomic hash requires a key and initialized Redis')
        bindings.set(this, { key, codec, redis, guard } as HashBinding<unknown>)
    }

    /** Cursor scan for offline maintenance; COUNT is Redis's hint, not a strict page-size guarantee. */
    async scan(cursor: number, count = 64): Promise<{ cursor: number; entries: { field: string; value: AtomicReadonly<T> }[] }> {
        if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(count) || count < 1 || count > 1000)
            throw new Error('invalid atomic hash scan cursor/count')
        const binding = bindingOf(this)
        const page = await binding.redis.client().hScan(binding.key, cursor, { COUNT: count })
        return { cursor: page.cursor, entries: page.tuples.map(({ field, value }) => ({ field, value: decodeReadonly(binding.codec, value) })) }
    }

    async read(field: string): Promise<AtomicReadonly<T> | undefined> {
        const binding = bindingOf(this)
        assertField(field)
        const raw = (await binding.redis.hGet(binding.key, field)) ?? null
        return raw === null ? undefined : decodeReadonly(binding.codec, raw)
    }
}

interface Observation {
    key: string
    field: string
    before: string | null
    after: string | null
    codec: AtomicHashCodec<unknown>
}

export class AtomicHashConflict extends Error {
    constructor() { super('atomic hash contention; retry the same business operation') }
}

/**
 * Optimistic serializable transaction on one Redis instance. All reads participate in validation.
 * Callback can run again: no external I/O, Bean mutation, notification or fresh random IDs inside it.
 * Network errors are NOT retried: commit may have succeeded; caller retries its durable operation ID.
 */
export class AtomicHashTransaction {
    private readonly observations = new Map<string, Observation>()
    private redis?: RedisCache
    private active = true
    private bytes = 0
    private pending = 0
    private deadline = 0

    private constructor() {}

    static async run<T>(work: (transaction: AtomicHashTransaction) => Promise<T>, attempts = 16): Promise<T> {
        if (!Number.isInteger(attempts) || attempts < 1 || attempts > 64) throw new Error('invalid retry bound')
        for (let attempt = 0; attempt < attempts; attempt++) {
            const transaction = new AtomicHashTransaction()
            try {
                const result = await work(transaction)
                if (await transaction.commit()) return result
            } finally {
                transaction.active = false
            }
            // Yield between conflicting attempts; never spin on the event loop.
            await new Promise<void>((resolve) => setTimeout(resolve, Math.min(2 ** attempt, 20)))
        }
        throw new AtomicHashConflict()
    }

    async get<T>(hash: AtomicHash<T>, field: string): Promise<AtomicReadonly<T> | undefined> {
        this.pending++
        try {
            const observation = await this.observe(hash, field)
            this.checkActive()
            return observation.after === null ? undefined : decodeReadonly(bindingOf(hash).codec, observation.after)
        } finally { this.pending-- }
    }

    async set<T>(hash: AtomicHash<T>, field: string, value: AtomicInput<T>): Promise<void> {
        this.pending++
        try {
            await bindingOf(hash).guard?.(this)
            const observation = await this.observe(hash, field)
            this.checkActive()
            const raw = bindingOf(hash).codec.encode(value)
            this.checkBytes(raw)
            observation.after = raw
        } finally { this.pending-- }
    }

    async delete<T>(hash: AtomicHash<T>, field: string): Promise<void> {
        this.pending++
        try {
            await bindingOf(hash).guard?.(this)
            const observation = await this.observe(hash, field)
            this.checkActive()
            observation.after = null
        } finally { this.pending-- }
    }

    /** Authoritative milliseconds for this attempt; binds the same Redis as the supplied hash. */
    async time<T>(hash: AtomicHash<T>): Promise<number> {
        this.pending++
        try {
            this.checkActive()
            this.bind(hash)
            const value = Number(await this.redis!.client().eval(READ_TIME, { keys: [], arguments: [] }))
            this.checkActive()
            if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid Redis clock')
            return value
        } finally { this.pending-- }
    }

    /** Retry the callback if the commit reaches Redis at/after this exclusive deadline. */
    validBefore(deadlineMs: number): void {
        this.checkActive()
        if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0) throw new Error('invalid atomic deadline')
        this.deadline = this.deadline ? Math.min(this.deadline, deadlineMs) : deadlineMs
    }

    private bind<T>(hash: AtomicHash<T>): HashBinding<T> {
        const binding = bindingOf(hash)
        if (this.redis && this.redis.getId() !== binding.redis.getId()) throw new Error('cross-Redis atomic commit forbidden')
        this.redis = binding.redis
        return binding
    }

    private checkActive() {
        if (!this.active) throw new Error('atomic hash transaction has ended')
    }

    private checkBytes(raw: string | null) {
        this.bytes += raw === null ? 0 : Buffer.byteLength(raw)
        if (this.bytes > 1024 * 1024) throw new Error('atomic hash transaction exceeds 1 MiB')
    }

    private async observe<T>(hash: AtomicHash<T>, field: string): Promise<Observation> {
        this.checkActive()
        assertField(field)
        const binding = this.bind(hash)
        const address = JSON.stringify([binding.key, field])
        const previous = this.observations.get(address)
        if (previous) {
            if (previous.codec !== binding.codec) throw new Error('conflicting codecs for the same atomic hash field')
            return previous
        }
        if (this.observations.size >= 256) throw new Error('atomic hash transaction exceeds 256 fields')
        const before = (await binding.redis.hGet(binding.key, field)) ?? null
        this.checkActive()
        // Concurrent get calls must converge to the same observation.
        const concurrent = this.observations.get(address)
        if (concurrent) {
            if (concurrent.codec !== binding.codec) throw new Error('conflicting codecs for the same atomic hash field')
            return concurrent
        }
        if (this.observations.size >= 256) throw new Error('atomic hash transaction exceeds 256 fields')
        this.checkBytes(before)
        const observation: Observation = { key: binding.key, field, before, after: before, codec: binding.codec as AtomicHashCodec<unknown> }
        this.observations.set(address, observation)
        return observation
    }

    private async commit(): Promise<boolean> {
        this.checkActive()
        if (this.pending !== 0) throw new Error('atomic hash operations must be awaited before commit')
        this.active = false
        if (!this.redis) {
            if (this.deadline) throw new Error('atomic deadline requires a bound Redis clock or hash')
            return true
        }
        if (!this.observations.size && !this.deadline) return true
        const keys = [...new Set([...this.observations.values()].map((value) => value.key))]
        const entries = [...this.observations.values()].map((value) => [
            keys.indexOf(value.key) + 1, value.field, value.before, value.after,
        ])
        return Number(await this.redis.client().eval(COMMIT_HASH_FIELDS, {
            keys, arguments: [JSON.stringify(entries), String(this.deadline)],
        })) === 1
    }
}

// Validate every key type and every precondition before the first mutation. Redis Lua errors
// do not roll back prior writes; a wrong-type key must therefore fail during the read pass.
const COMMIT_HASH_FIELDS = `
-- atomic-hash-fields-v1
local deadline = tonumber(ARGV[2]) or 0
if deadline > 0 then
    local now = redis.call('TIME')
    if tonumber(now[1]) * 1000 + math.floor(tonumber(now[2]) / 1000) >= deadline then return 0 end
end
local entries = cjson.decode(ARGV[1])
for _, key in ipairs(KEYS) do
    local kind = redis.call('TYPE', key).ok
    if kind ~= 'none' and kind ~= 'hash' then return redis.error_reply('WRONGTYPE atomic hash') end
end
for _, entry in ipairs(entries) do
    local current = redis.call('HGET', KEYS[entry[1]], entry[2])
    local expected = entry[3]
    if expected == cjson.null then
        if current ~= false then return 0 end
    elseif current ~= expected then return 0 end
end
for _, entry in ipairs(entries) do
    if entry[3] ~= entry[4] then
        if entry[4] == cjson.null then redis.call('HDEL', KEYS[entry[1]], entry[2])
        else redis.call('HSET', KEYS[entry[1]], entry[2], entry[4]) end
    end
end
return 1
`

const READ_TIME = `
-- atomic-hash-time-v1
local now = redis.call('TIME')
return tonumber(now[1]) * 1000 + math.floor(tonumber(now[2]) / 1000)
`

function bindingOf<T>(hash: AtomicHash<T>): HashBinding<T> {
    const binding = bindings.get(hash)
    if (!binding) throw new Error('unbound atomic hash')
    return binding as HashBinding<T>
}

function assertField(field: string) {
    if (typeof field !== 'string' || !field || Buffer.byteLength(field) > 1024) throw new Error('invalid atomic hash field')
}

function decodeReadonly<T>(codec: AtomicHashCodec<T>, raw: string): AtomicReadonly<T> {
    return freeze(codec.decode(raw)) as AtomicReadonly<T>
}

function freeze<T>(value: T): T {
    if (value !== null && typeof value === 'object') {
        for (const child of Object.values(value)) freeze(child)
        Object.freeze(value)
    }
    return value
}
