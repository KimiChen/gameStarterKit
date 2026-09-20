import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaUserdaily } from '../models/TaUserdaily'

/**
 * taDaily_userdaily
 * 事件名:每日玩家进度
 * 说明:每日23:50分推送玩家当前信息
 * @param user User
 */
export function taDaily_userdaily(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaUserdaily()

        // 字段名:充值金额,示例:1000
        obj.amount = 0
        // 字段名:有效历练次数,示例:1
        obj.experience_time = 0
        // 字段名:妖盟名称,示例:妖盟111
        obj.guild_name = ''
        // 字段名:法宝等级,示例:1
        obj.arm_level = 0
        // 字段名:功法等级,示例:1
        obj.card_level = 0
        // 字段名:成就等级,示例:1
        obj.achieve_level = 0
        // 字段名:法宝评分,示例:1000
        obj.arm_fp = 0
        // 字段名:功法评分,示例:1000
        obj.card_fp = 0
        // 字段名:资历点,示例:1000
        obj.achieve_fp = 0
        // 字段名:装备评分,示例:1000
        obj.equip_fp = 0
        // 字段名:法宝加成,示例:5
        obj.arm_up = 0
        // 字段名:元神加成,示例:5
        obj.gong_up = 0
        // 字段名:装备加成,示例:5
        obj.equip_up = 0
        // 字段名:境界加成,示例:5
        obj.realm_up = 0
        // 字段名:素罗攻击次数,示例:1000
        obj.npc_atk_time = 0
        // 字段名:PVP击杀次数,示例:1
        obj.pvp_kill_time = 0
        // 字段名:PVE被击杀次数,示例:1
        obj.pve_be_kill_time = 0
        // 字段名:PVP被击杀次数,示例:1
        obj.pvp_be_kill_time = 0
        // 字段名:力量,示例:1
        obj.strength = 0
        // 字段名:耐力,示例:1
        obj.endurance = 0
        // 字段名:体力,示例:2
        obj.constitution = 0
        // 字段名:攻击,示例:3
        obj.atk = 0
        // 字段名:防御,示例:3
        obj.def = 0
        // 字段名:血量,示例:3
        obj.hp = 0
        // 字段名:暴击,示例:0.01
        obj.crit = 0
        // 字段名:爆伤,示例:0.01
        obj.critDamage = 0
        // 字段名:增伤,示例:0.01
        obj.hurt = 0
        // 字段名:减伤,示例:0.01
        obj.harmless = 0
        // 字段名:经验值,示例:123124124
        obj.exp = 0
        // 字段名:世界等级,示例:111
        obj.world_lv = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
