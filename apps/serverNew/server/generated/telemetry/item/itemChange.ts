import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaItemChange } from '../models/TaItemChange'

/**
 * taItem_itemChange
 * 事件名:道具资源变更
 * 说明:道具资源变更后推送
 * @param user User
 */
export function taItem_itemChange(user: User, taItem: TaItemChange) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaItemChange()

        // 字段名:道具类型,示例:道具
        obj.item_type = taItem.item_type
        // 字段名:道具id,示例:101
        obj.item_id = taItem.item_id
        // 字段名:道具名称,示例:元宝
        obj.item_name = taItem.item_name
        // 字段名:变更值,示例:1000
        obj.change = taItem.change
        // 字段名:变更后,示例:1050
        obj.after = taItem.after
        // 字段名:场景,示例:main
        obj.scene = taItem.scene
        // 字段名:场景ID,示例:1901
        obj.scene_id = taItem.scene_id
        // 字段名:BOSS名称,示例:狮王
        obj.area = taItem.area
        // 字段名:变更原因,示例:充值档位
        obj.reason = taItem.reason
        // 字段名:所属系统,示例:充值
        obj.action_mod = taItem.action_mod

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
