import fs from 'fs'
import json5 from 'json5'
import { md5 } from '../../../utils/common'
import { RedisCache } from '../../../database/RedisCache'
import { PlatformConfig, PlatformRedisConfig, AdjustRedisConfig } from '../../../typings/conf-platform'
import { getHttpReqClientIp } from '../../util/util'
import { httpCfg } from '../../config'
import { HttpRequest, HttpResponse } from '../../routes/base'
import { AdjustRedisPolicyError, resolveAdjustRedisCommand } from './redisPolicy'

type RedisConnectionKey = 'centerRedis' | 'userRedis' | 'serverRedis'

interface RedisSsoUser {
    name?: string
    account?: string
    role?: 'readonly' | 'readwrite'
}

export interface RedisCommandReq {
    command: string
    params: unknown[]
    connConfig: {
        key: string
        db?: number
    }
}

export interface RedisCommandRes {
    errMsg?: string
    data?: unknown
    command?: string
    durationMs?: number
    resultBytes?: number
}

export interface RedisConnectionRes {
    key: RedisConnectionKey
    connectionName: string
    connectionReadOnly: boolean
    db: number
    allowedDatabases: number[]
    maxScanCount: number
    maxRangeItems: number
}

interface ResolvedConnection extends RedisConnectionRes {
    redis: PlatformRedisConfig
}

const CONNECTION_KEYS: RedisConnectionKey[] = ['centerRedis', 'userRedis', 'serverRedis']
const DEFAULT_LIMITS = {
    maxArgumentCount: 100,
    maxArgumentBytes: 64 * 1024,
    maxResultBytes: 1024 * 1024,
    maxScanCount: 1000,
    maxRangeItems: 1000,
}

/** 前端 Redis 修改器展示用的提示信息。 */
export async function tipProtocol(req: HttpRequest, res: HttpResponse<string>) {
    const json = fs.readFileSync(httpCfg.beanPath, 'utf8')
    res.send(json)
}

function getPlatformConfig(): PlatformConfig {
    return json5.parse(fs.readFileSync(httpCfg.platformPath, 'utf8'))
}

function requireRedisToolConfig(platform: PlatformConfig): AdjustRedisConfig {
    const config = platform.adjustRedis
    if (!config?.enabled) {
        throw new AdjustRedisPolicyError('当前线路未开启 Redis 调试工具', 403)
    }
    return config
}

function isAiRequest(req: HttpRequest) {
    return req.get('x-adjust-tool-source') === 'ai-assistant'
}

function requireAiRedisConfig(platform: PlatformConfig, req: HttpRequest) {
    if (!isAiRequest(req)) return
    if (platform.adjustAi?.enabled !== true || platform.adjustAi?.redis !== true) {
        throw new AdjustRedisPolicyError('当前线路未开启 AI Redis 工具', 403)
    }
}

function getConnections(platform: PlatformConfig, user?: RedisSsoUser, aiRequest = false): ResolvedConnection[] {
    const toolConfig = requireRedisToolConfig(platform)
    const userReadOnly = user?.role === 'readonly'
    const aiReadOnly = aiRequest && platform.adjustAi?.redisWrite !== true
    const connections: ResolvedConnection[] = []

    for (const key of CONNECTION_KEYS) {
        const policy = toolConfig.connections?.[key]
        if (!policy || policy.enabled === false) continue
        const redis = platform[key]
        const configuredDb = redis.database ?? 0
        const allowedDatabases = Array.from(new Set(policy.allowedDatabases ?? [configuredDb]))
            .filter((db) => Number.isInteger(db) && db >= 0)
        if (allowedDatabases.length === 0) continue
        const db = allowedDatabases.includes(configuredDb) ? configuredDb : allowedDatabases[0]
        connections.push({
            key,
            connectionName: policy.name ?? key,
            connectionReadOnly: !toolConfig.writeEnabled || policy.readOnly === true || userReadOnly || aiReadOnly,
            db,
            allowedDatabases,
            maxScanCount: toolConfig.maxScanCount ?? DEFAULT_LIMITS.maxScanCount,
            maxRangeItems: toolConfig.maxRangeItems ?? DEFAULT_LIMITS.maxRangeItems,
            redis,
        })
    }
    return connections
}

function getRequestUser(req: HttpRequest): RedisSsoUser | undefined {
    return (req as HttpRequest & { adjustSsoUser?: RedisSsoUser }).adjustSsoUser
}

function getResultBytes(data: unknown) {
    return Buffer.byteLength(JSON.stringify(data) ?? '')
}

function audit(req: HttpRequest, fields: Record<string, unknown>, error?: unknown) {
    const user = getRequestUser(req)
    const record = {
        user: user?.name ?? '',
        account: user?.account ?? '',
        source: req.get('x-adjust-tool-source') || 'web-tool',
        ip: getHttpReqClientIp(req),
        ...fields,
        success: !error,
        error: error instanceof Error ? error.message.slice(0, 300) : error ? String(error).slice(0, 300) : undefined,
    }
    const line = `[adjust-redis-audit] ${JSON.stringify(record)}`
    if (error) Log.http.warn(line)
    else Log.http.info(line)
}

function sendRedisError(res: HttpResponse<RedisCommandRes>, error: unknown) {
    const statusCode = error instanceof AdjustRedisPolicyError ? error.statusCode : 500
    const message = error instanceof Error ? error.message : String(error)
    res.status(statusCode).send({ errMsg: message })
}

export async function redisCommand(req: HttpRequest<any, RedisCommandReq>, res: HttpResponse<RedisCommandRes>) {
    const startedAt = Date.now()
    let auditFields: Record<string, unknown> = {
        connection: req.body?.connConfig?.key ?? '',
        db: req.body?.connConfig?.db,
        command: String(req.body?.command ?? '').trim().toUpperCase(),
        argumentCount: Array.isArray(req.body?.params) ? req.body.params.length : 0,
    }

    try {
        const platform = getPlatformConfig()
        requireAiRedisConfig(platform, req)
        const toolConfig = requireRedisToolConfig(platform)
        const limits = {
            maxArgumentCount: toolConfig.maxArgumentCount ?? DEFAULT_LIMITS.maxArgumentCount,
            maxArgumentBytes: toolConfig.maxArgumentBytes ?? DEFAULT_LIMITS.maxArgumentBytes,
            maxScanCount: toolConfig.maxScanCount ?? DEFAULT_LIMITS.maxScanCount,
            maxRangeItems: toolConfig.maxRangeItems ?? DEFAULT_LIMITS.maxRangeItems,
        }
        const resolvedCommand = resolveAdjustRedisCommand(req.body?.command, req.body?.params ?? [], limits)
        const connection = getConnections(platform, getRequestUser(req), isAiRequest(req))
            .find((item) => item.key === req.body?.connConfig?.key)
        if (!connection) {
            throw new AdjustRedisPolicyError('Redis 连接不存在或未启用', 403)
        }
        const db = Number(req.body?.connConfig?.db ?? connection.db)
        if (!Number.isInteger(db) || !connection.allowedDatabases.includes(db)) {
            throw new AdjustRedisPolicyError(`Redis DB ${db} 不在当前连接允许范围内`, 403)
        }
        if (resolvedCommand.access === 'write' && connection.connectionReadOnly) {
            throw new AdjustRedisPolicyError('当前用户或 Redis 连接没有写权限', 403)
        }

        auditFields = {
            connection: connection.key,
            db,
            command: resolvedCommand.command,
            argumentCount: resolvedCommand.args.length,
            keyDigest: resolvedCommand.args[0] ? md5(resolvedCommand.args[0]).slice(0, 12) : '',
        }

        const redis = new RedisCache({ ...connection.redis, database: db })
        try {
            await redis.connect()
            const data = await redis.callFunction(resolvedCommand.redisCommand, ...resolvedCommand.args)
            const resultBytes = getResultBytes(data)
            const maxResultBytes = toolConfig.maxResultBytes ?? DEFAULT_LIMITS.maxResultBytes
            if (resultBytes > maxResultBytes) {
                throw new AdjustRedisPolicyError(`Redis 结果超过 ${maxResultBytes} 字节限制`, 413)
            }
            const durationMs = Date.now() - startedAt
            audit(req, { ...auditFields, durationMs, resultBytes })
            res.send({ data, command: resolvedCommand.command, durationMs, resultBytes })
        } finally {
            if (redis.client().isOpen) {
                await redis.disconnect()
            }
        }
    } catch (error) {
        audit(req, { ...auditFields, durationMs: Date.now() - startedAt }, error)
        sendRedisError(res, error)
    }
}

export async function redisConnections(req: HttpRequest, res: HttpResponse<RedisConnectionRes[] | RedisCommandRes>) {
    try {
        const platform = getPlatformConfig()
        requireAiRedisConfig(platform, req)
        const data = getConnections(platform, getRequestUser(req), isAiRequest(req)).map(({ redis, ...connection }) => connection)
        res.send(data)
    } catch (error) {
        sendRedisError(res as HttpResponse<RedisCommandRes>, error)
    }
}
