import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaWorldBoss } from '../models/TaWorldBoss'

/**
 * taWorld_worldBoss
 * 事件名:世界BOSS
 * 说明:玩家击杀世界BOSS后推送
 * @param user User
 */
export function taWorld_worldBoss(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaWorldBoss()

        // 字段名:BOSS名称,示例:XX
        obj.boss_name = ''
        // 字段名:BOSS等级,示例:123
        obj.boss_lv = 0
        // 字段名:奖励类型,示例:归属/无次数
        obj.awards_type = ''
        // 字段名:奖励内容,示例:XXX
        obj.awards_items = []

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
