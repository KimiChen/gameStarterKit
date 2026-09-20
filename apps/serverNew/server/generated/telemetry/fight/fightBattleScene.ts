import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaFightBattleScene } from '../models/TaFightBattleScene'

/**
 * taFight_fightBattleScene
 * 事件名:战斗场景变更
 * 说明:战斗场景变更时推送
 * @param user User
 */
export function taFight_fightBattleScene(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaFightBattleScene()

        // 字段名:地图名称,示例:武学副本
        obj.scene_type = ''
        // 字段名:场景,示例:紫儿
        obj.scene = ''
        // 字段名:变更原因,示例:进入地图/退出地图
        obj.reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
