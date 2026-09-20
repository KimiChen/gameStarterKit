import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaFightPvp } from '../models/TaFightPvp'

/**
 * taFight_fightPvp
 * 事件名:战斗_击杀玩家
 * 说明:击杀玩家后推送
 * @param user User
 */
export function taFight_fightPvp(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaFightPvp()

        // 字段名:获胜角色助阵侠客,示例:小龙女
        obj.win_assist_name = ''
        // 字段名:获胜角色助阵侠客ID,示例:123
        obj.win_assist_id = ''
        // 字段名:死亡角色ID,示例:10002
        obj.lost_role_id = ''
        // 字段名:死亡角色昵称,示例:好不好
        obj.lost_role_name = ''
        // 字段名:死亡角色战力,示例:1000
        obj.lost_role_fp = 0
        // 字段名:死亡地图,示例:世界BOSS
        obj.map = ''
        // 字段名:NPC名称,示例:狮王
        obj.boss_name = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
