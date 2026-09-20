import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaArena } from '../models/TaArena'

/**
 * taFight_arena
 * 事件名:竞技场
 * 说明:竞技场战斗结束后推送
 * @param user User
 */
export function taFight_arena(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaArena()

        // 字段名:敌方ID,示例:12580
        obj.enemy_id = ''
        // 字段名:敌方昵称,示例:一按我帮你
        obj.enemy_name = ''
        // 字段名:敌方战力,示例:100
        obj.enemy_fp = 0
        // 字段名:类型,示例:进攻
        obj.type = ''
        // 字段名:战斗结果,示例:胜利
        obj.fight_rlt = ''
        // 字段名:排名,示例:5
        obj.rank = 0
        // 字段名:变更值,示例:500
        obj.change = 0
        // 字段名:变更后,示例:1000
        obj.after = 0
        // 字段名:赛季id,示例:1
        obj.season_id = 0
        // 字段名:赛季排名,示例:null
        obj.season_rank = 0
        // 字段名:赛季积分变更值,示例:null
        obj.season_change = 0
        // 字段名:赛季积分变更后,示例:null
        obj.season_after = 0
        // 字段名:是否跨服,示例:是
        obj.if_cross = false

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
