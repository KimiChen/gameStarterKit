import { User } from '../../user/bean/User'
import { ActivityOperatorRegistry } from '../operation/ActivityOperatorRegistry'
import { ActivityScheduleResolver } from '../scheduling/ActivityScheduleResolver'

export class ActivityAvailabilityRules {
    static async isOpen(sId: int, activityName: string, user?: User) {
        const schedule = await ActivityScheduleResolver.getOpen(sId, activityName, user)
        return schedule && schedule.checkIsOpen()
    }

    static async isAwardTime(sId: int, activityName: string, user?: User) {
        const operator = await ActivityOperatorRegistry.getActivityOperator(sId, activityName, user)
        if (!operator?.activityOpenInfo) return false
        return operator.activityOpenInfo.checkIsAwardTime(operator.awardDelayTime)
    }

    static async canSave(sId: int, activityName: string, user?: User) {
        const schedule = await ActivityScheduleResolver.getOpen(sId, activityName, user)
        return schedule && schedule.checkCanSave()
    }

    static async isDailyStart(sId: int, activityName: string) {
        return true
    }
}
