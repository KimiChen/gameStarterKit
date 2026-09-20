import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaPlantBeenHelp } from '../models/TaPlantBeenHelp'

/**
 * taPlant_plantBeenHelp
 * 事件名:被协助
 * 说明:被协助时推送
 * @param user User
 */
export function taPlant_plantBeenHelp(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaPlantBeenHelp()

        // 字段名:协助人ID,示例:12123
        obj.help_uid = ''
        // 字段名:协助人名称,示例:小甜兔
        obj.help_name = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
