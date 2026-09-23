/**
 * RedisKey枚举
 */
export enum RedisKey {
    /** 区服在线玩家缓存 */
    ServerUserOnline = 'ServerUserOnline:',
    /** 玩家写入 Event Worker 归属；离线后仍保留，保证后台事件与后续请求落到同一槽位。 */
    ServerPlayerWorkerOwner = 'ServerPlayerWorkerOwner:',
}

/** 在线玩家缓存,按区Id分组 */
export function RdKey_UserOnline(sId: int) {
    return RedisKey.ServerUserOnline + sId
}

export function RdKey_PlayerWorkerOwner(sId: int) {
    return RedisKey.ServerPlayerWorkerOwner + sId
}
