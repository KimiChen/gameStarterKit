export class AttrItem {
    /** 生命值 */
    public hp: int = 0

    /** 攻击值 */
    public atk: int = 0

    /** 防御值 */
    public def: int = 0

    /** 攻击速度(每多少ms攻击一次) */
    public speed: int = 0

    /** 命中 */
    public hit: int = 0

    /** 闪避 */
    public dodge: int = 0

    /** 暴率 */
    public crit: int = 0

    /** 抗暴 */
    public lowCrit: int = 0

    /** 暴伤 */
    public critDamage: int = 0

    /** 穿透 */
    public penetrate: int = 0

    /** 坚韧 */
    public lowPenetrate: int = 0

    /** 增伤 */
    public hurt: int = 0

    /** 减伤 */
    public harmless: int = 0

    /** 眩晕 */
    public vertigo: int = 0

    /** 抗晕 */
    public lowVertigo: int = 0

    /** 治疗 */
    public cure: int = 0

    /** 攻击百分比 */
    public atkPer: int = 0

    /** 防御百分比 */
    public defPer: int = 0

    /** 生命百分比 */
    public hpPer: int = 0

    /** 全局攻击百分比 */
    public globalAtkPer: int = 0

    /** 全局防御百分比 */
    public globalDefPer: int = 0

    /** 全局生命百分比 */
    public globalHpPer: int = 0

    /** 最终增伤 */
    public finalHurt: int = 0

    /** 最终减伤 */
    public finalHarmless: int = 0

    /** 大招增加的攻击率 */
    public skillAtkPer: int = 0

    /** 抵抗大招增加的攻击率 */
    public lowSkillAtkPer: int = 0

    /** 大招增加眩晕率 */
    public skillVertigo: int = 0

    /** 抗大招眩晕率 */
    public lowSkillVertigo: int = 0

    /** 大招耗法力减少 */
    public lowMpCost: int = 0

    /** 法力条上限增加 */
    public mpUp: int = 0

    /** 大招持续时间增加(单位毫秒) */
    public skillDuration: int = 0

    /** Boss每次恢复点数 */
    public bossRageRecoverNum: int = 0

    /** 入场法力（蓝条） */
    public baseMana: int = 0

    /** 大招首次效果 */
    public skillFirstRatio: int = 0

    /** 技能额外攻击伤害 */
    public skillAtkExHarm: int = 0

    /** 技能额外防御伤害 */
    public skillDefExHarm: int = 0

    /** 技能额外攻击治疗 */
    public skillAtkExCure: int = 0

    /** 技能额外防御治疗 */
    public skillDefExCure: int = 0

    /** 战场攻击属性临时增强 */
    public battleAtkPer: int = 0

    /** 战场防御属性临时增强 */
    public battleDefPer: int = 0
}
