import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaTitle } from '../models/TaTitle'

/**
 * taTitle_title
 * 事件名:称号变更
 * 说明:称号获得/穿戴时推送
 * @param user User
 */
export function taTitle_title(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaTitle()

        // 字段名:称号类型,示例:荣誉称号
        obj.titles_type = ''
        // 字段名:称号品质,示例:甲级
        obj.title_quality = ''
        // 字段名:称号名称,示例:福建大侠
        obj.title_name = ''
        // 字段名:变更原因,示例:冲榜活动获得
        obj.reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
