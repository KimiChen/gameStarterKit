import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaPlantHelp } from '../models/TaPlantHelp'

/**
 * taPlant_plantHelp
 * 事件名:协助他人
 * 说明:协助他人时推送
 * @param user User
 */
export function taPlant_plantHelp(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaPlantHelp()

        // 字段名:被协助人ID,示例:12123
        obj.been_help_uid = ''
        // 字段名:协助人名称,示例:小甜兔
        obj.help_name = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
