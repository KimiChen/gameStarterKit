import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaFightPve } from '../models/TaFightPve'

/**
 * taFight_fightPve
 * 事件名:战斗_击杀BOSS
 * 说明:击杀BOSS后推送
 * @param user User
 */
export function taFight_fightPve(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaFightPve()

        // 字段名:副本类型,示例:世界boss
        obj.map_type = ''
        // 字段名:boss类型,示例:姑苏河畔
        obj.boss_type = ''
        // 字段名:NPC名称,示例:狮王(100级)
        obj.boss_name = ''
        // 字段名:战斗结果,示例:胜利
        obj.fight_result = ''
        // 字段名:是否召唤,示例:是/否
        obj.is_summon = false
        // 字段名:奖励内容,示例:经验,银两
        obj.awards_items = []

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
