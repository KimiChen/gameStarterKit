import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaAchieve } from '../models/TaAchieve'

/**
 * taAchieve_achieve
 * 事件名:成就
 * 说明:成就状态变更时推送
 * @param user User
 */
export function taAchieve_achieve(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaAchieve()

        // 字段名:成就名称,示例:我我我
        obj.achieve_name = ''
        // 字段名:成就品质,示例:绿色
        obj.achieve_quality = ''
        // 字段名:成就描述,示例:你你你
        obj.achieve_describe = ''
        // 字段名:奖励内容,示例:XXX
        obj.awards_items = []
        // 字段名:资历点变更值,示例:1
        obj.change_qualification = 0
        // 字段名:资点变更后,示例:2
        obj.after_qualification = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
