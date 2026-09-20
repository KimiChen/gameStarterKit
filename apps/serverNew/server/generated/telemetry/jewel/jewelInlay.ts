import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaJewelInlay } from '../models/TaJewelInlay'

/**
 * taJewel_jewelInlay
 * 事件名:宝石
 * 说明:镶嵌＆升级后推送
 * @param user User
 */
export function taJewel_jewelInlay(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaJewelInlay()

        // 字段名:装备部位,示例:衣服
        obj.equip_pos = ''
        // 字段名:宝石品质,示例:1
        obj.jewel_quality = ''
        // 字段名:原有宝石品质,示例:0
        obj.before_jewel_quality = ''
        // 字段名:宝石名称,示例:攻击石
        obj.jewel_name = ''
        // 字段名:变更原因,示例:镶嵌/升级
        obj.reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
