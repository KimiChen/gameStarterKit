import { TimeRecovery } from '../../../modules/user/rules/TimeRecovery'
import { UserErrors } from '../UserErrors'
import { TimesBean } from '../bean/TimesBean'
import { User } from '../bean/User'

/**
 * 玩家精力
 */
export class UserPower {
    /**
     * 初始化精力
     * @param user
     * @returns
     */
    static initPower(user: User) {
        user.power = new TimesBean()
        user.power.times = C.level(1).powerLimit
        return user.power
    }

    /**
     * 恢复精力
     * @param user
     */
    static recovery(user: User) {
        if (user.power == null) {
            user.power = this.initPower(user)
        }

        const lvConf = C.level(user.lv)
        const before = user.power.times
        const nextTime = TimeRecovery.calCD(user.power, Param.PowerRecoverCd, lvConf.powerLimit)
        const after = user.power.times

        // 同步场景恢复体力
        const diff = after - before

        return nextTime
    }

    /**
     * 精力改变
     * @param user
     * @param num
     */
    static changeNum(user: User, num: int) {
        const nextTime = this.recovery(user)

        if (user.power) {
            if (num < 0 && num + user.power.times < 0) {
                throw UserErrors.UserNumIsSmall
            }
            user.power.times += num
        }

        if (nextTime > 0) {
            this.setNextRecovery(user, nextTime)
        }
    }

    /**
     * 设置下次定时恢复事件
     * @param user
     * @param nextTime 下次次数恢复时间
     * @returns
     */
    static setNextRecovery(user: User, nextTime: int) {
        if (nextTime == 0) {
            return
        }
        if (user.power != null && user.power.times >= C.level(user.lv).powerLimit) {
            return
        }

        // TODO:Timer_设置下次定时恢复
    }
}
