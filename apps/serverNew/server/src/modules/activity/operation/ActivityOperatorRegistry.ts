import { classList } from '../../../../generated/configTypes/activityOperator-info'
import { User } from '../../user/bean/User'
import { ActivityScheduleResolver } from '../scheduling/ActivityScheduleResolver'
import { ActivityOperator } from './ActivityOperator'

export class ActivityOperatorRegistry {
    static async getActivityOperator(
        sId: int,
        activityName: string,
        user?: User,
    ): Promise<ActivityOperator | undefined> {
        const schedule = await ActivityScheduleResolver.getOpen(sId, activityName, user)
        if (!schedule) return

        const typeClass = `${C.list(activityName).typeActivityName}Operator`
        if (!Object.hasOwn(classList, typeClass)) {
            Log.error(`找不到对应${typeClass}类,可能需要先执行classList代码生成脚本`)
            return
        }
        return new classList[typeClass as keyof typeof classList](schedule)
    }
}
