import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaPlantHarvest } from '../models/TaPlantHarvest'

/**
 * taPlant_plantHarvest
 * 事件名:桃园采集
 * 说明:桃园采集时推送
 * @param user User
 */
export function taPlant_plantHarvest(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaPlantHarvest()

        // 字段名:奖励内容,示例:[仙玉*1,灵气*1]
        obj.awards_items = []
        // 字段名:妖仆名称,示例:蛙不困
        obj.worker_name = ''
        // 字段名:当日累计采集,示例:2
        obj.harvest_times = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
