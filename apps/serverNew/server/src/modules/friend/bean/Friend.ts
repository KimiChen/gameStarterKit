import { DiffMap, Mod, OnlyRedis, UserHash } from '@arthropoda/game-engine'
import { FriendItemBean } from './FriendItemBean'

@Mod
export class Friend extends UserHash {
    id: int = 0

    /**
     * 玩家ID
     */
    userId: int = 0

    /**
     * 游戏好友列表
     */
    list?: DiffMap<int, FriendItemBean>

    /**
     * 申请列表
     */
    @OnlyRedis
    applyList?: DiffMap<int, FriendItemBean>

    /**
     * 发出好友申请的记录
     */
    @OnlyRedis
    applyRecord?: DiffMap<int, FriendItemBean>

    /**
     * 黑名单列表
     */
    black?: DiffMap<int, FriendItemBean>

    /**
     * 好友最近聊天列表
     */
    @OnlyRedis
    recently?: DiffMap<int, FriendItemBean>

    /**
     * 最近请求时间
     */
    @OnlyRedis
    recentlyTime: int = 0
}
