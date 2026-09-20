import { RedisCache } from '../database/RedisCache'
import { RedisInstance } from '../database/RedisInstance'
import { RdKey_UserOnline } from '../enums/RedisKey'
import { timestamp } from '../utils/common'

export interface IUserOnline {
    /** 玩家Id */
    uId: int
    /** 当前区服进程内的连接 ID */
    connectionId: int
    /** 固定业务区服 */
    sid: int
    /** 上次活跃时间 */
    activityTime: int
}

/**
 * 60s检测一次是否用户的活跃度
 */
export const MONITOR_OFFLINE_TIME = 60

/**
 * 没有更新活跃时间，则为离线
 */
export const OFFLINE_TIME: int = 300

/**
 * 在线玩家维护
 */
export class UserOnlineMgr {
    static _redis?: RedisCache

    static get redis() {
        if (!this._redis) {
            this._redis = RedisInstance.getCenterRedis()
        }
        return this._redis
    }

    /**
     * 新增在线玩家
     */
    static async add(uid: int, sid: int, connectionId: int) {
        const info: IUserOnline = {
            uId: uid,
            connectionId,
            sid,
            activityTime: timestamp(),
        }
        await this.redis.hSet(RdKey_UserOnline(sid), uid, JSON.stringify(info))
    }

    /**
     * 删除在线玩家
     */
    static async del(uid: int, sid: int, expectedConnectionId?: int) {
        if (expectedConnectionId !== undefined) {
            const script = `
                local current = redis.call('HGET', KEYS[1], ARGV[1])
                if not current then
                    return 0
                end
                local decoded = cjson.decode(current)
                if tonumber(decoded.connectionId) ~= tonumber(ARGV[2]) then
                    return 0
                end
                return redis.call('HDEL', KEYS[1], ARGV[1])
            `
            return this.redis.client().eval(script, {
                keys: [RdKey_UserOnline(sid)],
                arguments: [String(uid), String(expectedConnectionId)],
            })
        }
        await this.redis.hDel(RdKey_UserOnline(sid), String(uid))
    }

    /**
     * 原子替换用户在线归属，并返回替换前的连接。
     *
     * 重复登录可能落在不同 Event Worker；先写入新归属，旧连接后续的异步 close
     * 才不会把新连接从 Redis 在线表中删除。
     */
    static async replace(uid: int, sid: int, connectionId: int): Promise<IUserOnline | null> {
        const next: IUserOnline = {
            uId: uid,
            connectionId,
            sid,
            activityTime: timestamp(),
        }
        const previous = await this.redis.client().eval(
            `
                local previous = redis.call('HGET', KEYS[1], ARGV[1])
                redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
                return previous or ''
            `,
            {
                keys: [RdKey_UserOnline(sid)],
                arguments: [String(uid), JSON.stringify(next)],
            },
        )
        if (!previous || typeof previous !== 'string') {
            return null
        }
        return JSON.parse(previous) as IUserOnline
    }

    /**
     * 获取在线玩家
     * @param uid
     * @param sid
     * @returns
     */
    static async get(uid: int, sid: int) {
        const rs = await this.redis.hGet(RdKey_UserOnline(sid), String(uid))
        if (rs) {
            const user = JSON.parse(rs) as IUserOnline
            if (user.connectionId > 0) {
                return user
            }
        }
        return null
    }

    /**
     * 玩家是否在线
     * @param uId
     * @param sId
     * @returns
     */
    static async isOnline(uId: int, sId: int) {
        const rs = await UserOnlineMgr.get(uId, sId)
        return rs !== null && rs.connectionId !== 0
    }

    /**
     * 获取在线玩家
     * @param sid
     * @param uids
     * @returns
     */
    static async getUsers(sid: int, ...uids: int[]): Promise<Record<string, IUserOnline | undefined>> {
        const users: Record<string, IUserOnline | undefined> = {}
        const rs = await this.redis.hmGet(RdKey_UserOnline(sid), uids)
        for (let index = 0; index < uids.length; index++) {
            const uid = uids[index]
            const item = rs[index]
            if (!item) {
                users[uid] = undefined
            } else {
                const user = JSON.parse(item) as IUserOnline
                users[uid] = user
            }
        }
        return users
    }

    /**
     * 获取区服所有在线玩家
     * @param sid
     * @returns
     */
    static async getAll(sid: int): Promise<Array<IUserOnline>> {
        const users: IUserOnline[] = []
        const rs = await this.redis.hGetAll(RdKey_UserOnline(sid))
        for (const index in rs) {
            const data = rs[index]
            if (!data) {
                continue
            }
            const user = JSON.parse(rs[index]) as IUserOnline
            if (user.connectionId > 0) {
                users.push(user)
            }
        }
        return users
    }

    /**
     * 更新活跃时间
     * @param sid
     * @param uId
     */
    static async updateTime(sid: int, uId: int) {
        const rs = await this.redis.hGet(RdKey_UserOnline(sid), String(uId))
        if (rs) {
            const user = JSON.parse(rs) as IUserOnline
            user.activityTime = timestamp()
            await this.redis.hSet(RdKey_UserOnline(sid), String(uId), JSON.stringify(user))
        }
    }

    /**
     * 检测用户是否在线，清理长时间不活跃的在线记录。
     *
     * 只维护业务可见的在线表：关闭连接是持有该连接的通道自己的职责（原生 Lobby 由连接
     * 生命周期与心跳负责），框架不在这里越权关闭 socket。
     * @param sid
     */
    static async monitorUserOnlines(sid: int) {
        const now = timestamp()
        const closeUids = []
        const users = await UserOnlineMgr.getAll(sid)
        for (const user of users) {
            if (now - user.activityTime < OFFLINE_TIME) {
                continue
            }
            closeUids.push(user.uId.toString())
        }
        if (closeUids.length > 0) {
            UserOnlineMgr.redis.hDel(RdKey_UserOnline(sid), closeUids).catchError('src/net/UserOnlineMgr.ts#2:')
        }
    }
}
