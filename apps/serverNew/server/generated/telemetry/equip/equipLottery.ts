import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaEquipLottery } from '../models/TaEquipLottery'

/**
 * taEquip_equipLottery
 * 事件名:装备抽取
 * 说明:装备抽取后推送（10连传10条）
 * @param user User
 */
export function taEquip_equipLottery(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaEquipLottery()

        // 字段名:类型,示例:免费/半价/元宝/精铁
        obj.equip_type = ''
        // 字段名:装备等级,示例:130
        obj.equip_level = 0
        // 字段名:装备部位,示例:护手
        obj.equip_pos = ''
        // 字段名:装备品质,示例:红/橙/黄
        obj.equip_quality = ''
        // 字段名:装备ID,示例:123
        obj.equip_id = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
