import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaLostKnowledgeUse } from '../models/TaLostKnowledgeUse'

/**
 * taLostKnowledge_lostKnowledgeUse
 * 事件名:妖术释放
 * 说明:妖术释放后推送
 * 释放一次推送一条
 * @param user User
 */
export function taLostKnowledge_lostKnowledgeUse(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaLostKnowledgeUse()

        // 字段名:妖术类型,示例:攻击/被动/触发
        obj.lost_knowledge_type = ''
        // 字段名:战斗类型,示例:PVP/PVE
        obj.fight_type = ''
        // 字段名:变更原因,示例:场景（无场景记录所属系统）
        obj.reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
