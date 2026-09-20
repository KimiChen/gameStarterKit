import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaPlantWater } from '../models/TaPlantWater'

/**
 * taPlant_plantWater
 * 事件名:浇水
 * 说明:浇水时推送
 * @param user User
 */
export function taPlant_plantWater(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaPlantWater()

        // 字段名:浇水次数,示例:1
        obj.water_times = 0
        // 字段名:当日剩余次数,示例:1
        obj.left_water_imes = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
