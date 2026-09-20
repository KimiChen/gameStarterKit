import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaPlantAskHelp } from '../models/TaPlantAskHelp'

/**
 * taPlant_plantAskHelp
 * 事件名:发起协助申请
 * 说明:发起协助申请时推送
 * @param user User
 */
export function taPlant_plantAskHelp(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaPlantAskHelp()

        // 字段名:当日发起协助次数,示例:1
        obj.ask_times = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
