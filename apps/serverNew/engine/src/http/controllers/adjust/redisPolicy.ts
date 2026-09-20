export type AdjustRedisCommandAccess = 'read' | 'write' | 'denied'

export interface AdjustRedisCommandPolicy {
    access: AdjustRedisCommandAccess
    command: string
    redisCommand: string
    args: string[]
}

export interface AdjustRedisLimits {
    maxArgumentCount: number
    maxArgumentBytes: number
    maxScanCount: number
    maxRangeItems: number
}

export class AdjustRedisPolicyError extends Error {
    constructor(message: string, readonly statusCode: number = 400) {
        super(message)
    }
}

const READ_COMMANDS = new Set([
    'DBSIZE', 'EXISTS', 'GET', 'GETRANGE', 'HEXISTS', 'HGET', 'HGETALL', 'HKEYS', 'HLEN', 'HMGET', 'HVALS',
    'INFO', 'LINDEX', 'LLEN', 'LRANGE', 'MGET', 'PING', 'PTTL', 'SCAN', 'SCARD', 'SDIFF', 'SINTER',
    'SISMEMBER', 'SMEMBERS', 'SRANDMEMBER', 'SSCAN', 'STRLEN', 'SUNION', 'TTL', 'TYPE', 'ZCARD', 'ZCOUNT',
    'ZRANGE', 'ZRANGEBYSCORE', 'ZRANK', 'ZREVRANGE', 'ZREVRANGEBYSCORE', 'ZREVRANK', 'ZSCAN', 'ZSCORE',
    'HSCAN', 'XLEN', 'XRANGE', 'XREVRANGE', 'JSON.GET', 'MEMORY USAGE',
])

const WRITE_COMMANDS = new Set([
    'DEL', 'EXPIRE', 'HDEL', 'HSET', 'LREM', 'LPUSH', 'PERSIST', 'RENAME', 'RPUSH', 'SADD', 'SET', 'SREM',
    'XADD', 'XDEL', 'ZADD', 'ZREM', 'JSON.SET',
])

const RANGE_COMMANDS = new Set(['LRANGE', 'ZRANGE', 'ZREVRANGE'])
const SCAN_COMMANDS = new Set(['SCAN', 'HSCAN', 'SSCAN', 'ZSCAN'])

function flattenParams(values: unknown[], output: string[] = []): string[] {
    for (const value of values) {
        if (Array.isArray(value)) {
            flattenParams(value, output)
            continue
        }
        if (value === null || value === undefined) {
            throw new AdjustRedisPolicyError('Redis 命令参数不能为 null 或 undefined')
        }
        if (typeof value === 'object') {
            throw new AdjustRedisPolicyError('Redis 命令参数仅支持字符串、数字和布尔值')
        }
        output.push(String(value))
    }
    return output
}

function normalizeCommand(commandInput: unknown, paramsInput: unknown = []) {
    if (!Array.isArray(paramsInput)) {
        throw new AdjustRedisPolicyError('Redis params 必须是数组')
    }
    let args = flattenParams(paramsInput)
    let commandParts = String(commandInput ?? '').trim().toUpperCase().split(/\s+/).filter(Boolean)
    if (commandParts.length === 0) {
        throw new AdjustRedisPolicyError('Redis 命令不能为空')
    }

    if (commandParts[0] === 'CALL') {
        if (args.length === 0) {
            throw new AdjustRedisPolicyError('CALL 缺少受控扩展命令')
        }
        commandParts = args.shift()!.trim().toUpperCase().split(/\s+/).filter(Boolean)
    }

    if (commandParts.length > 1) {
        args = [...commandParts.slice(1), ...args]
    }

    const redisCommand = commandParts[0]
    let command = redisCommand
    if (redisCommand === 'MEMORY' || redisCommand === 'JSON') {
        const subCommand = args.shift()?.toUpperCase() ?? ''
        command = `${redisCommand} ${subCommand}`.trim()
        if (redisCommand === 'MEMORY') {
            args.unshift(subCommand)
        } else {
            command = `JSON.${subCommand}`
        }
    }

    return { command, redisCommand: command.startsWith('JSON.') ? command : redisCommand, args }
}

export function getAdjustRedisCommandAccess(command: unknown, params: unknown = []): AdjustRedisCommandAccess {
    try {
        const normalized = normalizeCommand(command, params)
        if (READ_COMMANDS.has(normalized.command)) return 'read'
        if (WRITE_COMMANDS.has(normalized.command)) return 'write'
        return 'denied'
    } catch {
        return 'denied'
    }
}

function validateScanCount(command: string, args: string[], maxScanCount: number) {
    if (!SCAN_COMMANDS.has(command)) return
    const countIndex = args.findIndex((arg) => arg.toUpperCase() === 'COUNT')
    if (countIndex === -1) return
    const count = Number(args[countIndex + 1])
    if (!Number.isInteger(count) || count < 1 || count > maxScanCount) {
        throw new AdjustRedisPolicyError(`SCAN COUNT 必须是 1-${maxScanCount} 的整数`)
    }
}

function validateRange(command: string, args: string[], maxRangeItems: number) {
    if (RANGE_COMMANDS.has(command)) {
        const start = Number(args[1])
        const stop = Number(args[2])
        if (!Number.isInteger(start) || !Number.isInteger(stop) || stop < start || stop - start + 1 > maxRangeItems) {
            throw new AdjustRedisPolicyError(`范围查询单次最多返回 ${maxRangeItems} 项`)
        }
    }
    if (command === 'XRANGE' || command === 'XREVRANGE') {
        const countIndex = args.findIndex((arg) => arg.toUpperCase() === 'COUNT')
        if (countIndex === -1) {
            throw new AdjustRedisPolicyError(`${command} 必须指定 COUNT，且最多为 ${maxRangeItems}`)
        }
        const count = Number(args[countIndex + 1])
        if (!Number.isInteger(count) || count < 1 || count > maxRangeItems) {
            throw new AdjustRedisPolicyError(`${command} COUNT 必须是 1-${maxRangeItems} 的整数`)
        }
    }
}

export function resolveAdjustRedisCommand(command: unknown, params: unknown, limits: AdjustRedisLimits): AdjustRedisCommandPolicy {
    const normalized = normalizeCommand(command, params)
    const access = READ_COMMANDS.has(normalized.command)
        ? 'read'
        : WRITE_COMMANDS.has(normalized.command)
            ? 'write'
            : 'denied'

    if (access === 'denied') {
        throw new AdjustRedisPolicyError(`禁止执行 Redis 命令：${normalized.command}`, 403)
    }
    if (normalized.args.length > limits.maxArgumentCount) {
        throw new AdjustRedisPolicyError(`Redis 命令参数数量不能超过 ${limits.maxArgumentCount}`)
    }
    const argumentBytes = normalized.args.reduce((total, arg) => total + Buffer.byteLength(arg), 0)
    if (argumentBytes > limits.maxArgumentBytes) {
        throw new AdjustRedisPolicyError(`Redis 命令参数总长度不能超过 ${limits.maxArgumentBytes} 字节`)
    }

    validateScanCount(normalized.command, normalized.args, limits.maxScanCount)
    validateRange(normalized.command, normalized.args, limits.maxRangeItems)

    return { ...normalized, access }
}
