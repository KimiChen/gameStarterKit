import { FriendItemBean } from '../friend/FriendItemBean'

export interface Friend {
    id: int
    /**
     * 玩家ID
     */
    userId: int
    /**
     * 游戏好友列表
     */
    list?: Map<int, FriendItemBean>
    /**
     * 申请列表
     */
    applyList?: Map<int, FriendItemBean>
    /**
     * 发出好友申请的记录
     */
    applyRecord?: Map<int, FriendItemBean>
    /**
     * 黑名单列表
     */
    black?: Map<int, FriendItemBean>
    /**
     * 好友最近聊天列表
     */
    recently?: Map<int, FriendItemBean>
    /**
     * 最近请求时间
     */
    recentlyTime: int
}
