import { OnlyNet, Bean } from '@arthropoda/game-engine'
import { UserInfoOnlyNetBean } from '../../user/bean/UserInfoOnlyNetBean'

export class FriendItemBean extends Bean {
    /**
     * 好友ID
     */
    id: int = 0

    /**
     * 添加时间、或者最后的更新时间
     */
    addTime: int = 0

    /**
     * 记录单向发送的次数
     */
    num: int = 0

    /**
     * 记录上次发消息的人id
     */
    lastId: int = 0

    /**
     * 是否在线
     */
    @OnlyNet
    online: boolean = false

    /**
     * 最近一次活跃时间
     */
    @OnlyNet
    activityTime: int = 0

    /**
     * 上次通话的时间
     */
    @OnlyNet
    chatTime: int = 0

    /**
     * 玩家信息显示
     */
    @OnlyNet
    userBaseInfo?: UserInfoOnlyNetBean
}
