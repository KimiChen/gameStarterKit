import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaFightPvpLost } from '../models/TaFightPvpLost'

/**
 * taFight_fightPvpLost
 * 事件名:战斗_被玩家击杀
 * 说明:被击杀后推送
 * @param user User
 */
export function taFight_fightPvpLost(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaFightPvpLost()

        // 字段名:获胜角色ID,示例:10002
        obj.win_role_id = ''
        // 字段名:获胜角色昵称,示例:好不好
        obj.win_role_name = ''
        // 字段名:获胜角色战力,示例:1000
        obj.win_role_fp = 0
        // 字段名:获胜角色助阵侠客,示例:玄机
        obj.win_assist_name = ''
        // 字段名:获胜角色助阵侠客ID,示例:123
        obj.win_assist_id = ''
        // 字段名:死亡地图,示例:世界BOSS
        obj.map = ''
        // 字段名:NPC名称,示例:狮王
        obj.boss_name = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
