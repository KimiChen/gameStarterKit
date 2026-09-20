import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaFightInvitation } from '../models/TaFightInvitation'

/**
 * taFight_fightInvitation
 * 事件名:战斗_邀请
 * 说明:邀请战斗后推送
 * @param user User
 */
export function taFight_fightInvitation(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaFightInvitation()

        // 字段名:邀请地图,示例:场景（无场景记录所属系统）
        obj.invitation_map = ''
        // 字段名:受邀请角色ID,示例:123456,123456
        obj.invited_user_id = []

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
