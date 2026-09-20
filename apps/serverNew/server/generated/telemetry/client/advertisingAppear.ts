import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaAdvertisingAppear } from '../models/TaAdvertisingAppear'

/**
 * taClient_advertisingAppear
 * 事件名:广告位曝光
 * 说明:打开特定带广告相关界面时推送
 * @param user User
 */
export function taClient_advertisingAppear(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaAdvertisingAppear()

        // 字段名:客户端事件ID,示例:1
        obj.client_event_id = 0
        // 字段名:客户端事件名称,示例:体力/天墉城广告礼包/每日福利
        obj.client_event_name = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
