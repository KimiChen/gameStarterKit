import { UserInfoOnlyNetBean } from '../user/UserInfoOnlyNetBean'

export interface FriendItemBean {
    /**
     * 好友ID
     */
    id: int
    /**
     * 添加时间、或者最后的更新时间
     */
    addTime: int
    /**
     * 记录单向发送的次数
     */
    num: int
    /**
     * 记录上次发消息的人id
     */
    lastId: int
    /**
     * 是否在线
     */
    online: boolean
    /**
     * 最近一次活跃时间
     */
    activityTime: int
    /**
     * 上次通话的时间
     */
    chatTime: int
    /**
     * 玩家信息显示
     */
    userBaseInfo?: UserInfoOnlyNetBean
}
