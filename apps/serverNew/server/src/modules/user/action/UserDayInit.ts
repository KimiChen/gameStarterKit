import { UtilTime } from '@arthropoda/game-engine'
import { User } from '../bean/User'
import { ServerUserModel } from '../../../../generated/persistence/ServerUserModel'
import { timestamp } from '@arthropoda/game-engine'

export class UserDayInit {
    public static async dayInit(user: User): Promise<boolean> {
        const now = timestamp()
        // 判断是否过天
        if (user.nextDayTime > now) {
            return false
        }
        user.nextDayTime = UtilTime.getCurrentResetTime()
        user.loginDays += 1

        //各业务系统每日重置
        await ServerUserModel.update(
            {
                userId: String(user.id),
            },
            {
                userActivityTime: now,
                //数据库里不知道为什么是数字形式,只存日期刚好存的下
                userLoginDate: Number(UtilTime.formatYMD(now)),
                userLoginDays: user.loginDays,
            },
        )
        return true
    }
}
