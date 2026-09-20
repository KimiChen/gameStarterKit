import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaEquipWear } from '../models/TaEquipWear'

/**
 * taEquip_equipWear
 * 事件名:装备穿戴
 * 说明:装备穿戴后推送
 * @param user User
 */
export function taEquip_equipWear(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaEquipWear()

        // 字段名:装备品质,示例:紫阶
        obj.equip_quality = ''
        // 字段名:装备名称,示例:布甲
        obj.equip_name = ''
        // 字段名:装备评分,示例:100
        obj.equip_fp = 0
        // 字段名:装备等级,示例:10
        obj.equip_level = 0
        // 字段名:装备部位,示例:1
        obj.equip_pos = ''
        // 字段名:装备词条,示例:1
        obj.equip_affix = ''
        // 字段名:装备id,示例:1
        obj.equip_id = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
