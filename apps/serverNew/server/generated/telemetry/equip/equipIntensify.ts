import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaEquipIntensify } from '../models/TaEquipIntensify'

/**
 * taEquip_equipIntensify
 * 事件名:装备强化
 * 说明:装备强化后推送
 * @param user User
 */
export function taEquip_equipIntensify(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaEquipIntensify()

        // 字段名:装备部位,示例:1
        obj.equip_pos = ''
        // 字段名:变更后,示例:1
        obj.after = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
