import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaClothingDurability } from '../models/TaClothingDurability'

/**
 * taClothing_clothingDurability
 * 事件名:时装耐久度
 * 说明:时装耐久度变更后推送
 * @param user User
 */
export function taClothing_clothingDurability(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaClothingDurability()

        // 字段名:时装名称,示例:龙刀
        obj.clothing_name = ''
        // 字段名:时装品质,示例:甲级兵器
        obj.clothing_quality = ''
        // 字段名:时装id,示例:6666
        obj.clothing_id = 0
        // 字段名:变更值,示例:-1
        obj.change = 0
        // 字段名:变更后,示例:0
        obj.after = 0
        // 字段名:变更原因,示例:恢复/消耗
        obj.reason = ''
        // 字段名:场景,示例:XX地图
        obj.scene = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
