import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaEquipDurable } from '../models/TaEquipDurable'

/**
 * taEquip_equipDurable
 * 事件名:装备耐久
 * 说明:耐久产生变化时推送
 * @param user User
 */
export function taEquip_equipDurable(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaEquipDurable()

        // 字段名:装备品质,示例:紫阶
        obj.equip_quality = ''
        // 字段名:装备名称,示例:布甲
        obj.equip_name = ''
        // 字段名:装备等级,示例:10
        obj.equip_level = 0
        // 字段名:装备id,示例:1
        obj.equip_id = 0
        // 字段名:耐久变更前,示例:null
        obj.before = 0
        // 字段名:耐久变更值,示例:null
        obj.change = 0
        // 字段名:耐久变更后,示例:null
        obj.after = 0
        // 字段名:场景,示例:main
        obj.scene = ''
        // 字段名:场景ID,示例:1901
        obj.scene_id = 0
        // 字段名:耐久变更原因,示例:PVE击杀/PVP击杀/精铁补充
        obj.reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
