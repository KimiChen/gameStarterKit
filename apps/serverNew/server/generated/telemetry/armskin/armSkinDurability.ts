import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaArmSkinDurability } from '../models/TaArmSkinDurability'

/**
 * taArmSkin_armSkinDurability
 * 事件名:至宝耐久度
 * 说明:至宝耐久度变更后推送
 * @param user User
 */
export function taArmSkin_armSkinDurability(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaArmSkinDurability()

        // 字段名:至宝名称,示例:甲级兵器
        obj.arm_skin_name = ''
        // 字段名:至宝品质,示例:绿色
        obj.arm_skin_quality = ''
        // 字段名:至宝ID,示例:123
        obj.arm_skin_id = 0
        // 字段名:变更值,示例:0
        obj.change = 0
        // 字段名:变更后,示例:恢复/消耗
        obj.after = 0
        // 字段名:变更原因,示例:null
        obj.reason = ''
        // 字段名:场景,示例:XX地图
        obj.scene = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
