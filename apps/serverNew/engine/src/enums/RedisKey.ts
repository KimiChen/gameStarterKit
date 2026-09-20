/**
 * RedisKey枚举
 */
export enum RedisKey {
    /** 区服在线玩家缓存 */
    ServerUserOnline = 'ServerUserOnline:',
}

/** 在线玩家缓存,按区Id分组 */
export function RdKey_UserOnline(sId: int) {
    return RedisKey.ServerUserOnline + sId
}
