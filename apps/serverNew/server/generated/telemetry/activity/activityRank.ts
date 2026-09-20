import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaActivityRank } from '../models/TaActivityRank'

/**
 * taActivity_activityRank
 * 事件名:活动排名
 * 说明:活动结束时推送
 * @param user User
 */
export function taActivity_activityRank(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaActivityRank()

        // 字段名:冲榜活动id,示例:1
        obj.act_id = ''
        // 字段名:冲榜名称,示例:战力冲榜
        obj.act_name = ''
        // 字段名:区服,示例:1/1-2-3-4(展示具体区服)
        obj.cross_id = ''
        // 字段名:活动类型,示例:本服/跨服
        obj.rank_type = ''
        // 字段名:排名,示例:1
        obj.rank = 0
        // 字段名:冲榜分数,示例:100000
        obj.final_score = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
