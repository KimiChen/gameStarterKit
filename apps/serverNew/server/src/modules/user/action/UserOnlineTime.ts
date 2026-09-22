import { UtilTime, timestamp } from '@arthropoda/game-engine'
import { User } from '../bean/User'

/** 用户在线时长累计规则，供会话生命周期复用。 */
export class UserOnlineTime {
    static sync(user: User): void {
        const now = timestamp()
        const activityTime = now - user.activityTime
        user.totalOnlineTime += activityTime
        user.onlineTime += activityTime

        const dayStart = UtilTime.getDayStartTime(now)
        if (user.activityTime < dayStart) user.onlineTime = now - dayStart
        user.activityTime = now
    }
}
