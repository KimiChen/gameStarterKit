import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaHomeSetNum } from '../models/TaHomeSetNum'

/**
 * taHome_homeSetNum
 * 事件名:发起采集
 * 说明:采集取消＆发起成时推送
 * @param user User
 */
export function taHome_homeSetNum(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaHomeSetNum()

        // 字段名:抢夺id,示例:10001
        obj.target_uid = 0
        // 字段名:抢夺昵称,示例:灭霸
        obj.target_name = ''
        // 字段名:采集资源,示例:精力/仙玉/宝石
        obj.resource_name = ''
        // 字段名:资源等级,示例:1
        obj.resource_lv = 0
        // 字段名:资源数量,示例:5
        obj.resource_num = 0
        // 字段名:采集人数,示例:1
        obj.worker_num = 0
        // 字段名:采集时间,示例:22
        obj.time = 0
        // 字段名:采集类型,示例:采集＆抢夺
        obj.type = ''
        // 字段名:变更原因,示例:发起＆取消
        obj.reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
