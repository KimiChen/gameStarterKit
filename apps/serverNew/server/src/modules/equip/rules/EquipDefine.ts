import { AttrTypeBean } from '../../attr/bean/AttrTypeBean'
import { User } from '../../user/bean/User'
import { EquipPropBean } from '../bean/EquipPropBean'
import { AttributeScale } from '../../attr/rules/AttributeScale'
import { RankDefine } from '../../rank/rules/RankDefine'

/**
 * 装备常量
 */
export class EquipDefine {
    //#region 装备小模块
    /** 装备所在位置映射 1头盔2衣服3裤子4护腕5腰带6鞋子 */
    static readonly EQUIP_POSITION = new Map<int, { field: keyof IConfEquip_award; desc: string }>([
        [1, { field: 'pos1', desc: '头盔' }],
        [2, { field: 'pos2', desc: '衣服' }],
        [3, { field: 'pos3', desc: '裤子' }],
        [4, { field: 'pos4', desc: '护腕' }],
        [5, { field: 'pos5', desc: '腰带' }],
        [6, { field: 'pos6', desc: '鞋子' }],
    ])

    /** 装备效果直接读表评分类型 */
    static readonly EQUIP_EFFECT_TYPE_CONF_FP = 1

    /** 装备效果计算得出评分类型 */
    static readonly EQUIP_EFFECT_TYPE_CALCULATE_FP = 2

    /** 自动溶解条件-等级 */
    static readonly EQUIP_AUTO_DISSOLVE_LV = 1

    /** 自动溶解条件-品质 */
    static readonly EQUIP_AUTO_DISSOLVE_QUALITY = 2

    /** 品质-灰色 */
    static readonly QUALITY_GREY = 1

    /** 品质-绿色 */
    static readonly QUALITY_GREEN = 2

    /** 品质-蓝色 */
    static readonly QUALITY_BLUE = 3

    /** 品质-紫色 */
    static readonly QUALITY_PURPLE = 4

    /** 品质-金色 */
    static readonly QUALITY_GOLD = 6

    /** 品质-橙色 */
    static readonly QUALITY_ORANGE = 8

    /** 品质-红色 */
    static readonly QUALITY_RED = 10

    static readonly QUALITY_NAMES: { [key: int]: string } = {
        [this.QUALITY_GREY]: '灰色',
        [this.QUALITY_GREEN]: '绿色',
        [this.QUALITY_BLUE]: '蓝色',
        [this.QUALITY_PURPLE]: '紫色',
        [this.QUALITY_GOLD]: '金色',
        [this.QUALITY_ORANGE]: '橙色',
        [this.QUALITY_RED]: '红色',
    }

    /** 打造保底映射：品质从高到底  */
    static readonly FORGE_BASE_QUALITY_MAPPING = new Map<keyof IConfEquip_draw & keyof IConfEquip_drawLvRange, int>([
        ['baseQuality10', this.QUALITY_RED],
        ['baseQuality8', this.QUALITY_ORANGE],
        ['baseQuality6', this.QUALITY_GOLD],
    ])
    //#endregion

    //#region 装备状态
    /** 正常状态 */
    static readonly STATUS_DEFAULT = 0

    /** 锁定状态 */
    static readonly STATUS_LOCK = 1
    //#endregion

    // #region 装备效果类型
    /** 属性变化 */
    static readonly EFFECT_ATTR_CHANGE = 1

    /** 佩戴等级变化 */
    static readonly EFFECT_WEAR_LV_CHANGE = 2

    /** 新增x个词条 */
    static readonly EFFECT_ADD_ENTRY = 3

    /** 装备基础属性额外增加比例 */
    static readonly EFFECT_ATTR_ADD_RATIO = 4

    /** 宝石基础属性额外增加比例 */
    static readonly EFFECT_GEM_ATTR_ADD_RATIO = 5

    /** 调用技能ID */
    static readonly EFFECT_SKILL_ID = 6
    // #endregion

    //#region 装备效果
    /** @var int 简易 */
    static readonly EFFECT_ID_8 = 8

    /** @var int 高级简易 */
    static readonly EFFECT_ID_9 = 9

    /** @var int 无级别 */
    static readonly EFFECT_ID_10 = 10

    /** @var int 彩色变异 */
    static readonly EFFECT_ID_21 = 21

    /** @var int 坚不可摧 */
    static readonly EFFECT_ID_25 = 25
    //#endregion

    // #region 装备效果bitset
    /** @var int 简易 */
    static readonly SHOW_TYPE_EFFECT8 = 1

    /** @var int 高级简易 */
    static readonly SHOW_TYPE_EFFECT9 = 2

    /** @var int 无级别 */
    static readonly SHOW_TYPE_EFFECT10 = 3

    /** @var int 彩色变异 */
    static readonly SHOW_TYPE_EFFECT21 = 4

    /** @var int 破损 */
    static readonly SHOW_TYPE_BROKEN = 5
    // #endregion

    //#region 时装小模块:1代表衣服2代表发饰3代表发型4代表五官5代表脸饰6代表套装
    /**  衣服 */
    static readonly CLOTHES = 1

    /** 发饰 */
    static readonly HAIR_DECORATE = 2

    /** 发型 */
    static readonly HAIR = 3

    /** 五官 */
    static readonly FACE = 4

    /** 脸饰 */
    static readonly FACE_DECORATE = 5

    /** 时装模块映射 */
    static readonly FASHION_TYPES: { [key: int]: string } = {
        [this.CLOTHES]: 'fashionId',
        [this.HAIR]: 'hair',
        [this.HAIR_DECORATE]: 'hairDecorate',
        [this.FACE]: 'face',
        [this.FACE_DECORATE]: 'faceDecorate',
    }

    /** 属性变化 */
    static readonly FASHION_ATTR_CHANGE = 1
    //#endregion

    //#region 属性方法封装
    /**
     * 装备位置转排行榜
     */
    static POS_TO_RANK: Map<number, string>

    static init() {
        this.POS_TO_RANK = new Map([
            [1, RankDefine.TYPE_EQ_HAIR],
            [2, RankDefine.TYPE_EQ_CLOTHES],
            [3, RankDefine.TYPE_EQ_PANTS],
            [4, RankDefine.TYPE_EQ_WRISTBAND],
            [5, RankDefine.TYPE_EQ_BELT],
            [6, RankDefine.TYPE_EQ_SHOE],
        ])
    }

    /**
     * 时装属性
     * @param equipFashionConf
     * @param attrMap
     */
    static fashionAttrs(equipFashionConf: IConfEquip_fashion, attrMap: Map<int, AttrTypeBean>) {
        for (const item of equipFashionConf.baseAttr) {
            const curTypeItem = this.getAttrItem(attrMap, item.attrType)
            curTypeItem.val += item.value
        }
    }

    /**
     * 时装属性
     * @param user
     * @param hasBase
     * @returns
     */
    static getFashionAttrs(user: User, hasBase = true) {
        const attrMap: Map<int, AttrTypeBean> = new Map()
        // 固定属性
        if (hasBase && user.fashion.fashions.size() > 0) {
            for (const [, fashion] of user.fashion.fashions) {
                const fashionCId = fashion.cId
                if (!fashionCId) {
                    continue
                }

                // 处理基础属性(大招减益战场中处理)
                const equipFashionConf = C.equip_fashion(fashionCId)
                EquipDefine.fashionAttrs(equipFashionConf, attrMap)
            }
        }
        return attrMap
    }

    /**
     * 符石属性
     * @param equipGemMoreConf
     * @param effects
     * @param attrMap
     */
    static gemAttrs(equipGemMoreConf: IConfEquip_gemMore, effects: int[], attrMap: Map<int, AttrTypeBean>) {
        // 装备中特效存在宝石基础属性加成
        let addition = 0
        for (const effectId of effects) {
            const equipEffectConf = C.equip_effect(effectId)
            if (equipEffectConf.type != EquipDefine.EFFECT_GEM_ATTR_ADD_RATIO) {
                continue
            }
            addition += equipEffectConf.value1
        }

        // 宝石属性
        const curTypeItem = this.getAttrItem(attrMap, equipGemMoreConf.attrType)
        const val = Math.floor(
            equipGemMoreConf.value + (equipGemMoreConf.value * addition) / AttributeScale.NUMBER_RATIO,
        )
        curTypeItem.val += val
    }

    /**
     * 符石提升装备基础属性万分比
     * @param equipGemMoreConf
     * @param equipPropItem
     * @param attrMap
     */
    static gemImproveBaseAttrs(
        equipGemMoreConf: IConfEquip_gemMore,
        equipPropItem: EquipPropBean,
        attrMap: Map<int, AttrTypeBean>,
        useDamage = false,
    ) {
        let equipBaseAttrs: Map<number, AttrTypeBean> = new Map()
        // 宝石提升装备基础属性万分比
        if (useDamage) {
            // 耐久度影响属性数值
            equipBaseAttrs = this.equipDamagedChange(equipPropItem.attr.copy(), equipPropItem.durable <= 0)
        } else {
            equipBaseAttrs = equipPropItem.attr.copy()
        }
        // 宝石提升装备基础属性万分比
        for (const [, attr] of equipBaseAttrs) {
            const curTypeItem = this.getAttrItem(attrMap, attr.type)
            curTypeItem.val += Math.floor((attr.val * equipGemMoreConf.equipRatio) / AttributeScale.NUMBER_RATIO)
        }
    }

    static getAttrItem(attrMap: Map<int, AttrTypeBean>, type: int) {
        let item = attrMap.get(type)
        if (item == null) {
            item = new AttrTypeBean()
            item.type = type
            attrMap.set(type, item)
        }
        return item
    }
    //#endregion

    /**
     * 获取指定特效属性
     * @param array         attrs
     * @param int           effectId
     * @param EquipPropItem equipPropItem
     * @param bool          useDamage 是否采用破损后属性计算
     * @return void
     */
    static attrFromEquipEffect(
        attrs: Map<int, AttrTypeBean>,
        effectId: int,
        equipPropItem: EquipPropBean,
        useDamage = false,
    ) {
        const equipEffectConf = C.equip_effect(effectId)
        switch (equipEffectConf.type) {
            case EquipDefine.EFFECT_ATTR_CHANGE:
                {
                    // 属性变更
                    const curTypeItem = EquipDefine.getAttrItem(attrs, equipEffectConf.value1)
                    curTypeItem.val += equipEffectConf.value2
                }
                break
            case EquipDefine.EFFECT_ATTR_ADD_RATIO:
                {
                    // 装备基础属性加成
                    if (equipPropItem.attr) {
                        // 耐久度影响属性数值
                        let baseAttrs: Map<number, AttrTypeBean> = new Map()
                        if (useDamage) {
                            baseAttrs = this.equipDamagedChange(equipPropItem.attr.copy(), equipPropItem.durable <= 0)
                        } else {
                            baseAttrs = equipPropItem.attr.copy()
                        }
                        for (const [type, attrItem] of baseAttrs) {
                            if (!attrItem.val) {
                                continue
                            }

                            const curTypeItem = EquipDefine.getAttrItem(attrs, type)
                            curTypeItem.val += Int(
                                attrItem.val * (equipEffectConf.value1 / AttributeScale.NUMBER_RATIO),
                            )
                        }
                    }
                }
                break
            default:
                break
        }
    }

    /**
     * 装备损坏处理
     * @param array|AttrTypeBean[] fromAttrs
     * @return array|AttrTypeBean[]
     */
    static equipDamagedChange(fromAttrs: Map<int, AttrTypeBean>, isDamaged = false) {
        // 耐久影响属性
        if (!isDamaged) {
            return fromAttrs
        }

        const attrs: Map<int, AttrTypeBean> = new Map()
        for (const [, fromAttr] of fromAttrs) {
            const curTypeItem = EquipDefine.getAttrItem(attrs, fromAttr.type)
            curTypeItem.val = Int(fromAttr.val * (Param.BrokenEquipmentAttrRatio / AttributeScale.NUMBER_RATIO))
        }
        return attrs
    }

    /**
     * 获取装备属性
     * @param user
     * @param equipId
     * @param attrs
     * @returns
     */
    static getEquipAttrs(user: User, equipId: int, attrs: Map<int, AttrTypeBean>) {
        if (!equipId) {
            return
        }

        // 装备详情
        const equipPropItem = user.equip.equipProps.get(equipId)
        if (!equipPropItem) {
            return
        }

        // 是否损坏
        const isDamaged = equipPropItem.durable <= 0

        // 装备基础属性
        if (equipPropItem.attr.size() > 0) {
            // 装备损坏对基础属性衰减
            const equipBaseAttrs = this.equipDamagedChange(equipPropItem.attr.copy(), isDamaged)
            for (const [, attrItem] of equipBaseAttrs) {
                const curTypeItem = EquipDefine.getAttrItem(attrs, attrItem.type)
                curTypeItem.val += attrItem.val
            }
        }

        // 词条属性
        if (equipPropItem.entries.size() > 0) {
            for (const [, entry] of equipPropItem.entries) {
                if (entry.attrMap.size() == 0) {
                    continue
                }
                // 装备损坏对词条属性衰减
                const equipEntryAttrs = this.equipDamagedChange(entry.attrMap.copy(), isDamaged)
                for (const [, attrItem] of equipEntryAttrs) {
                    const curTypeItem = EquipDefine.getAttrItem(attrs, attrItem.type)
                    curTypeItem.val += attrItem.val
                }
            }
        }

        // 特效加成
        this.equipEffectAttr(attrs, equipPropItem)
    }

    /**
     * 装备特效属性汇总
     * @param attrs
     * @param equipPropItem
     * @returns
     */
    static equipEffectAttr(attrs: Map<int, AttrTypeBean>, equipPropItem: EquipPropBean) {
        if (equipPropItem.effects.length() == 0) {
            return
        }
        for (const effectId of equipPropItem.effects) {
            this.attrFromEquipEffect(attrs, effectId, equipPropItem, true)
        }
    }

    // #region 耐久
    /**
     * 玩家装备耐久扣除点数
     * @param user
     * @param oldDurable
     * @param effects
     * @returns
     */
    static getEquipDurableCost(user: User, oldDurable: int, effects: number[] = []) {
        // 已损坏不可再次扣除耐久
        if (oldDurable <= 0) {
            return 0
        }

        // 坚不可摧效果,不扣除耐久
        if (EquipDefine.EFFECT_ID_25 in effects) {
            return 0
        }

        // 判断是否为红名玩家
        const num = Param.KilledReDurable

        // 红名阶段
        // if (!evilStage) {
        //     evilStage = UserEvil.userEvilStage(user)
        // }

        // if (evilStage.exReDurable) {
        //     num += evilStage.exReDurable
        // }

        // 更新耐久数值
        return Math.min(oldDurable, num)
    }
    // #endregion
}
