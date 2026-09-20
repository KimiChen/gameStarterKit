import { GameIdGenerator } from '../../runtime/identity/GameIdGenerator'
import { RedisInstance } from '@arthropoda/game-engine'

/** 外部字符串 uid 到引擎内部数值 uid 的持久化映射；绝不作 Number(uid) 转换。 */
export class NativeLobbyIdentityMap {
    private static readonly key = 'nativeLobby:identity:v1'

    async resolve(uid: string, sId: number): Promise<number> {
        const redis = RedisInstance.getCenterRedis()
        const field = `${sId}:${uid}`
        const stored = await redis.hGet(NativeLobbyIdentityMap.key, field)
        const parsed = parseInternalId(stored)
        if (parsed) return parsed

        // HSETNX 决定赢家，输家重新读取已提交的关联，避免并发建连分配两个身份。
        const candidate = await GameIdGenerator.getUserId(sId)
        if (await redis.hSetNX(NativeLobbyIdentityMap.key, field, String(candidate))) return candidate
        const winner = parseInternalId(await redis.hGet(NativeLobbyIdentityMap.key, field))
        if (!winner) throw new Error('native Lobby identity mapping write lost without a stored winner')
        return winner
    }
}

function parseInternalId(value: string | null | undefined): number | undefined {
    if (!value || !/^[1-9]\d*$/.test(value)) return undefined
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}
