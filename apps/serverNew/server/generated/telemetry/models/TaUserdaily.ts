/**
 * 模块名:每日玩家数据
 * 事件名:每日玩家进度
 * 说明:每日23:50分推送玩家当前信息
 */
export class TaUserdaily {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'userdaily'

    /**
     * 字段名:充值金额
     * 示例:1000
     */
    public amount: number = 0

    /**
     * 字段名:有效历练次数
     * 示例:1
     */
    public experience_time: number = 0

    /**
     * 字段名:妖盟名称
     * 示例:妖盟111
     */
    public guild_name: string = ''

    /**
     * 字段名:法宝等级
     * 示例:1
     */
    public arm_level: number = 0

    /**
     * 字段名:功法等级
     * 示例:1
     */
    public card_level: number = 0

    /**
     * 字段名:成就等级
     * 示例:1
     */
    public achieve_level: number = 0

    /**
     * 字段名:法宝评分
     * 示例:1000
     */
    public arm_fp: number = 0

    /**
     * 字段名:功法评分
     * 示例:1000
     */
    public card_fp: number = 0

    /**
     * 字段名:资历点
     * 示例:1000
     */
    public achieve_fp: number = 0

    /**
     * 字段名:装备评分
     * 示例:1000
     */
    public equip_fp: number = 0

    /**
     * 字段名:法宝加成
     * 示例:5
     */
    public arm_up: number = 0

    /**
     * 字段名:元神加成
     * 示例:5
     */
    public gong_up: number = 0

    /**
     * 字段名:装备加成
     * 示例:5
     */
    public equip_up: number = 0

    /**
     * 字段名:境界加成
     * 示例:5
     */
    public realm_up: number = 0

    /**
     * 字段名:素罗攻击次数
     * 示例:1000
     */
    public npc_atk_time: number = 0

    /**
     * 字段名:PVP击杀次数
     * 示例:1
     */
    public pvp_kill_time: number = 0

    /**
     * 字段名:PVE被击杀次数
     * 示例:1
     */
    public pve_be_kill_time: number = 0

    /**
     * 字段名:PVP被击杀次数
     * 示例:1
     */
    public pvp_be_kill_time: number = 0

    /**
     * 字段名:力量
     * 示例:1
     */
    public strength: number = 0

    /**
     * 字段名:耐力
     * 示例:1
     */
    public endurance: number = 0

    /**
     * 字段名:体力
     * 示例:2
     */
    public constitution: number = 0

    /**
     * 字段名:攻击
     * 示例:3
     */
    public atk: number = 0

    /**
     * 字段名:防御
     * 示例:3
     */
    public def: number = 0

    /**
     * 字段名:血量
     * 示例:3
     */
    public hp: number = 0

    /**
     * 字段名:暴击
     * 示例:0.01
     */
    public crit: number = 0

    /**
     * 字段名:爆伤
     * 示例:0.01
     */
    public critDamage: number = 0

    /**
     * 字段名:增伤
     * 示例:0.01
     */
    public hurt: number = 0

    /**
     * 字段名:减伤
     * 示例:0.01
     */
    public harmless: number = 0

    /**
     * 字段名:经验值
     * 示例:123124124
     */
    public exp: number = 0

    /**
     * 字段名:世界等级
     * 示例:111
     */
    public world_lv: number = 0

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
