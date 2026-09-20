import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaActivityAwards } from '../models/TaActivityAwards'

/**
 * taActivity_activityAwards
 * 事件名:活动奖励领取
 * 说明:活动图标结束时推送
 * @param user User
 */
export function taActivity_activityAwards(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaActivityAwards()

        // 字段名:冲榜活动id,示例:1
        obj.act_id = ''
        // 字段名:冲榜名称,示例:战力冲榜
        obj.act_name = ''
        // 字段名:排名,示例:1
        obj.rank = 0
        // 字段名:活动类型,示例:本服/跨服
        obj.rank_type = ''
        // 字段名:奖励内容,示例:经验,银两
        obj.awards_items = []
        // 字段名:奖励是否领取,示例:是
        obj.is_awards_take = false
        // 字段名:领取时间,示例:Thu Jan 01 1970 16:00:44 GMT+0800 (中国标准时间)
        obj.awards_time = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
