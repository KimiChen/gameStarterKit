import { RedisInstance } from '../database/RedisInstance'
import { RdKey_PlayerWorkerOwner } from '../enums/RedisKey'

/** 玩家写入 Owner。值是 Event Worker 槽位，不绑定某一代进程 pid。 */
export class PlayerWorkerOwner {
    static preferred(uid: int, workerNum: int): number {
        if (!Number.isInteger(workerNum) || workerNum <= 0)
            throw new Error(`player owner requires a positive worker count: ${workerNum}`)
        let hash = 0x811c9dc5
        const text = String(uid)
        for (let index = 0; index < text.length; index += 1) {
            hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193)
        }
        return (hash >>> 0) % workerNum
    }

    static async get(uid: int, sid: int): Promise<number | undefined> {
        const raw = await RedisInstance.getCenterRedis().hGet(RdKey_PlayerWorkerOwner(sid), String(uid))
        if (raw === null) return undefined
        const workerId = Number(raw)
        return Number.isInteger(workerId) && workerId >= 0 ? workerId : undefined
    }

    /**
     * 复用合法 Owner；缺失或超出当前 Event Worker 池时原子登记 candidate。
     *
     * Worker 重启沿用同一槽位，所以暂时不 READY 时不能改绑，否则旧请求恢复后会出现双 Owner。
     */
    static async claim(uid: int, sid: int, workerNum: int, candidate: int): Promise<number> {
        if (!Number.isInteger(uid) || uid <= 0) throw new Error(`player owner requires a positive uid: ${uid}`)
        if (!Number.isInteger(workerNum) || workerNum <= 0)
            throw new Error(`player owner requires a positive worker count: ${workerNum}`)
        if (!Number.isInteger(candidate) || candidate < 0 || candidate >= workerNum) {
            throw new Error(`player owner candidate is outside Event Worker pool: ${candidate}/${workerNum}`)
        }
        const result = await RedisInstance.getCenterRedis()
            .client()
            .eval(
                `
                -- player-worker-owner-claim
                local current = tonumber(redis.call('HGET', KEYS[1], ARGV[1]))
                local worker_num = tonumber(ARGV[2])
                if current and current >= 0 and current < worker_num then
                    return current
                end
                redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
                return tonumber(ARGV[3])
            `,
                {
                    keys: [RdKey_PlayerWorkerOwner(sid)],
                    arguments: [String(uid), String(workerNum), String(candidate)],
                },
            )
        const workerId = Number(result)
        if (!Number.isInteger(workerId) || workerId < 0 || workerId >= workerNum) {
            throw new Error(`invalid player owner returned by Redis: ${String(result)}`)
        }
        return workerId
    }
}
