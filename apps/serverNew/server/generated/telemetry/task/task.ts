import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaTask } from '../models/TaTask'

/**
 * taTask_task
 * 事件名:任务经验
 * 说明:任务经验变更时推送
 * @param user User
 */
export function taTask_task(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaTask()

        // 字段名:任务类型,示例:每日任务活跃度/XX战令经验
        obj.task_type = ''
        // 字段名:变更前进度,示例:123
        obj.before_progress = 0
        // 字段名:变更后进度,示例:123
        obj.after_progress = 0
        // 字段名:变更原因,示例:完成XX任务
        obj.reason = ''
        // 字段名:奖励内容,示例:[仙玉*1,灵气*1]
        obj.awards_items = []

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
