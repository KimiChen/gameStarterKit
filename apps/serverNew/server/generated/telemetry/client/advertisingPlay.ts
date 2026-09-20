import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaAdvertisingPlay } from '../models/TaAdvertisingPlay'

/**
 * taClient_advertisingPlay
 * 事件名:广告播放
 * 说明:广告播放完推送
 * @param user User
 */
export function taClient_advertisingPlay(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaAdvertisingPlay()

        // 字段名:事件类型,示例:完成播放
        obj.event_type = ''
        // 字段名:客户端事件ID,示例:1
        obj.client_event_id = 0
        // 字段名:客户端事件名称,示例:体力/天墉城广告礼包/每日福利
        obj.client_event_name = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
