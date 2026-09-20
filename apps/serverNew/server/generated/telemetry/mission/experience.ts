import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaExperience } from '../models/TaExperience'

/**
 * taMission_experience
 * 事件名:历练
 * 说明:玩家击杀历练BOSS后推送
 * @param user User
 */
export function taMission_experience(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaExperience()

        // 字段名:历练名称,示例:XX
        obj.experience_name = ''
        // 字段名:历练等级,示例:123
        obj.experience_lv = 0
        // 字段名:历练类型,示例:功法/法宝/中午场
        obj.experience_type = ''
        // 字段名:奖励类型,示例:归属/无次数
        obj.awards_type = ''
        // 字段名:奖励内容,示例:XXX
        obj.awards_items = []
        // 字段名:伤害排名,示例:1
        obj.hurt_rank = 0
        // 字段名:治疗排名,示例:1
        obj.cure_rank = 0
        // 字段名:控制排名,示例:1
        obj.control_rank = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
