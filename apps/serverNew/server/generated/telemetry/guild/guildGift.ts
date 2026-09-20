import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaGuildGift } from '../models/TaGuildGift'

/**
 * taGuild_guildGift
 * 事件名:山头砍价礼包
 * 说明:用户针对山头砍价礼包砍价或购买时上传该条日志
 * @param user User
 */
export function taGuild_guildGift(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaGuildGift()

        // 字段名:山头id,示例:223
        obj.guild_id = ''
        // 字段名:山头等级,示例:2
        obj.guild_lv = 0
        // 字段名:山头名称,示例:咖喱给给
        obj.guild_name = ''
        // 字段名:当前售卖的礼包配置id,示例:5
        obj.gift_id = 0
        // 字段名:本次操作类型,示例:砍价/购买/领差价
        obj.type = ''
        // 字段名:本次操作所处阶段,示例:砍价期间/重置期间
        obj.phase = ''
        // 字段名:价格变更前,示例:600
        obj.before = 0
        // 字段名:价格变更值,示例:-100
        obj.change = 0
        // 字段名:当前价格,示例:500
        obj.after = 0
        // 字段名:累计砍价次数,示例:7/22
        obj.bargain_num = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
