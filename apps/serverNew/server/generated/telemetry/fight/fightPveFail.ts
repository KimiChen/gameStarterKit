import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaFightPveFail } from '../models/TaFightPveFail'

/**
 * taFight_fightPveFail
 * 事件名:战斗_击杀BOSS失败
 * 说明:击杀BOSS失败后推送
 * @param user User
 */
export function taFight_fightPveFail(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaFightPveFail()

        // 字段名:副本类型,示例:世界boss
        obj.map_type = ''
        // 字段名:boss类型,示例:姑苏河畔
        obj.boss_type = ''
        // 字段名:NPC名称,示例:狮王(100级)
        obj.boss_name = ''
        // 字段名:战斗结果,示例:被BOSS击杀/退出地图
        obj.fight_result = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
