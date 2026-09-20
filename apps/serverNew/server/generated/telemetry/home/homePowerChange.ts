import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaHomePowerChange } from '../models/TaHomePowerChange'

/**
 * taHome_homePowerChange
 * 事件名:体力
 * 说明:体力变更时推送
 * @param user User
 */
export function taHome_homePowerChange(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaHomePowerChange()

        // 字段名:疲劳状态,示例:充沛、正常、疲惫、力竭
        obj.tired_stage = ''
        // 字段名:变更值,示例:1
        obj.change = 0
        // 字段名:变更前,示例:10
        obj.before = 0
        // 字段名:变更后,示例:11
        obj.after = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
