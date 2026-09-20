import { AttrTypeBean } from '../bean/AttrTypeBean'

interface IConfigAttr {
    attrType: int
    value: int
}

/**
 * 属性类型定义
 */
export class AttrDefine {
    /** 生命  */
    static readonly Hp = 1

    /** 攻击  */
    static readonly Atk = 2

    /** 防御  */
    static readonly Def = 3

    /** 攻击速度  */
    static readonly Speed = 4

    /** 命中  */
    static readonly Hit = 5

    /** 闪避  */
    static readonly Dodge = 6

    /** 暴率  */
    static readonly Crit = 7

    /** 抗暴  */
    static readonly LowCrit = 8

    /** 暴伤  */
    static readonly CritDamage = 9

    /** 穿透  */
    static readonly Penetrate = 10

    /** 坚韧  */
    static readonly LowPenetrate = 11

    /** 增伤  */
    static readonly Hurt = 12

    /** 减伤  */
    static readonly Harmless = 13

    /** 眩晕  */
    static readonly Vertigo = 14

    /** 抗晕  */
    static readonly LowVertigo = 15

    /** 治疗  */
    static readonly Cure = 16

    /** 攻击百分比  */
    static readonly AtkPer = 17

    /** 防御百分比  */
    static readonly DefPer = 18

    /** 生命百分比  */
    static readonly HpPer = 19

    /** 全局攻击百分比  */
    static readonly GlobalAtkPer = 20

    /** 全局防御百分比  */
    static readonly GlobalDefPer = 21

    /** 全局生命百分比  */
    static readonly GlobalHpPer = 22

    /** 最终增伤  */
    static readonly FinalHurt = 23

    /** 最终减伤  */
    static readonly FinalHarmless = 24

    /** 力量  */
    static readonly Strength = 25

    /** 耐力  */
    static readonly Endurance = 26

    /** 体力  */
    static readonly Constitution = 27

    /** 大招增加攻击率  */
    static readonly SkillAtkPer = 28

    /** 抗大招增加攻击率  */
    static readonly LowSkillAtkPer = 29

    /** 大招眩晕率  */
    static readonly SkillVertigo = 30

    /** 抗大招眩晕率  */
    static readonly LowSkillVertigo = 31

    /** 大招耗蓝减少  */
    static readonly LowMpCost = 32

    /** 蓝条上限增加  */
    static readonly MpUp = 33

    /** 大招持续事件增加  */
    static readonly SkillDuration = 34

    /** boss怒气恢复次数  */
    static readonly BossRageRecoverNum = 35

    /** 入场法力（蓝条）  */
    static readonly BaseMana = 36

    /** 大招首次效果  */
    static readonly SkillFirstRatio = 37

    /** 技能额外攻击伤害  */
    static readonly SkillAtkExHarm = 38

    /** 技能额外防御伤害  */
    static readonly SkillDefExHarm = 39

    /** 技能额外攻击治疗  */
    static readonly SkillAtkExCure = 40

    /** 技能额外防御治疗  */
    static readonly SkillDefExCure = 41

    /** 基础属性 */
    static Base_Attr_Types = [
        AttrDefine.Hp,
        AttrDefine.Atk,
        AttrDefine.Def,
        AttrDefine.Strength,
        AttrDefine.Endurance,
        AttrDefine.Constitution,
    ]

    /** 全局属性属性 */
    static Global_Attr_Types: Map<int, int> = new Map([
        [AttrDefine.GlobalAtkPer, AttrDefine.Atk],
        [AttrDefine.GlobalDefPer, AttrDefine.Def],
        [AttrDefine.GlobalHpPer, AttrDefine.Hp],
    ])

    /** 需要转化的属性类型 */
    static ConvertAttrs: Map<int, int[]>

    static init() {
        this.ConvertAttrs = new Map([
            [AttrDefine.Strength, [Param.TransferStrengthRate, AttrDefine.Atk]],
            [AttrDefine.Endurance, [Param.TransferEnduranceRate, AttrDefine.Def]],
            [AttrDefine.Constitution, [Param.TransferConstitutionRate, AttrDefine.Hp]],
        ])
    }

    /**
     * 获取固定属性列表
     * @param confAttrs 配表baseAttr
     * @returns
     */
    static getBaseAttr<T extends IConfigAttr>(confAttrs: T[]) {
        const attrs: Map<int, AttrTypeBean> = new Map()
        for (const attrItem of confAttrs) {
            const attrType = attrItem.attrType
            if (!attrs.has(attrType)) {
                attrs.set(attrType, new AttrTypeBean({ type: attrType }))
            }
            attrs.get(attrType)!.val += attrItem.value
        }
        return attrs
    }

    /**
     * 获取属性列表用于更新模块属性
     * @param source 来自配表
     * @returns
     */
    static attrsFromArrOrObj(source: any) {
        const attrs: Map<int, AttrTypeBean> = new Map()
        for (const [, conf] of C.attr()) {
            const field = conf.fieldName
            const getVal = source[field]
            if (!getVal) {
                continue
            }
            const item = new AttrTypeBean()
            item.type = conf.id
            item.val = getVal
            attrs.set(item.type, item)
        }
        return attrs
    }

    /**
     * 合并属性列表
     * @param attrMap
     * @param appendAttrMap
     */
    static mergeAttrs(attrMap: Map<int, AttrTypeBean>, appendAttrMap: AttrTypeBean[]): void {
        for (const item of appendAttrMap) {
            if (item.val == 0) {
                continue
            }

            if (C.attr(item.type) == null) {
                continue
            }

            let attr = attrMap.get(item.type)
            if (attr == null) {
                attr = new AttrTypeBean()
                attr.type = item.type
                attrMap.set(attr.type, attr)
            }
            attr.val += item.val
        }
    }
}
