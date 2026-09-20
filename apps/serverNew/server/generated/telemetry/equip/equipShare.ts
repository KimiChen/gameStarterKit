import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaEquipShare } from '../models/TaEquipShare'

/**
 * taEquip_equipShare
 * 事件名:装备分享
 * 说明:装备分享后推送
 * @param user User
 */
export function taEquip_equipShare(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaEquipShare()

        // 字段名:装备名称,示例:布甲
        obj.equip_name = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
