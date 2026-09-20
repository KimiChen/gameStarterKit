import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaLostKnowledge } from '../models/TaLostKnowledge'

/**
 * taLostKnowledge_lostKnowledge
 * 事件名:妖术等级
 * 说明:妖术等级变更后推送
 * @param user User
 */
export function taLostKnowledge_lostKnowledge(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaLostKnowledge()

        // 字段名:妖术名称,示例:吸星大法
        obj.lost_knowledge_name = ''
        // 字段名:种族名称,示例:狐狸
        obj.group_name = ''
        // 字段名:妖术类型,示例:攻击/被动/触发
        obj.lost_knowledge_type = ''
        // 字段名:变更值,示例:-1
        obj.change = 0
        // 字段名:变更后,示例:0
        obj.after = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
