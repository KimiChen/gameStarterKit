import { Attr } from '../../attr/calculation/Attr'
import { AttrTypeBean } from '../../attr/bean/AttrTypeBean'
import { User } from '../bean/User'
import { ActivityDefine } from '../../activity/rules/ActivityDefine'
import { AttrDefine } from '../../attr/rules/AttrDefine'
import { AttributeScale } from '../../attr/rules/AttributeScale'

export class PowerScoreRules {
    /** 功法等级评分 */
    static readonly FP_TYPE_GONG = 1

    /** 妖术评分 */
    static readonly FP_TYPE_SORCERY = 2

    /** 供奉评分 */
    static readonly FP_TYPE_WORSHIP = 3

    /** 神通穿戴评分（读表评分） */
    static readonly FP_TYPE_MAGIC_WEAR = 4

    /** 装备属性基础评分 */
    static readonly FP_TYPE_EQUIP = 5

    /** 宝石评分 */
    static readonly FP_TYPE_GEM = 6

    /** 时装固定属性（收集）评分 */
    static readonly FP_TYPE_FASHION = 7

    /** 法宝等级评分 */
    static readonly FP_TYPE_WEAPON = 8

    /** 器灵基础属性评分 */
    static readonly FP_TYPE_SOUL_BASE = 9

    /** 至宝穿戴评分（读表评分） */
    static readonly FP_TYPE_RARE_WEAR = 10

    /** 等级评分 */
    static readonly FP_TYPE_LV = 11

    /** 自由属性评分 */
    static readonly FP_TYPE_FREE_ATTR = 12

    /** 秘法评分 */
    static readonly FP_TYPE_MF = 13

    /** 神通收集评分（属性评分） */
    static readonly FP_TYPE_MAGIC_GET = 14

    /** 至宝收集评分（属性评分） */
    static readonly FP_TYPE_RARE_GET = 15

    /** 装备词条评分 */
    static readonly FP_TYPE_EQUIP_ENTRY = 16

    /** 装备效果评分 */
    static readonly FP_TYPE_EQUIP_EFFECT = 17

    /** 时装穿戴评分 */
    static readonly FP_TYPE_FASHION_WEAR = 18

    /** 器灵特殊属性评分 */
    static readonly FP_TYPE_SOUL_SPECIAL = 19

    /** 评分模块对应的冲榜活动  */
    static FP_RANK_MAP: Map<string, int[]> = new Map([
        // 功法评分冲榜
        [
            ActivityDefine.RankGongFp,
            [this.FP_TYPE_GONG, this.FP_TYPE_SORCERY, this.FP_TYPE_MAGIC_WEAR, this.FP_TYPE_MAGIC_GET],
        ],

        // 装备评分冲榜
        [
            ActivityDefine.RankEquipFp,
            [this.FP_TYPE_EQUIP, this.FP_TYPE_EQUIP_ENTRY, this.FP_TYPE_EQUIP_EFFECT, this.FP_TYPE_GEM],
        ],

        // 法宝评分冲榜
        [
            ActivityDefine.RankWeaponFp,
            [
                this.FP_TYPE_WEAPON,
                this.FP_TYPE_SOUL_BASE,
                this.FP_TYPE_SOUL_SPECIAL,
                this.FP_TYPE_RARE_GET,
                this.FP_TYPE_RARE_WEAR,
            ],
        ],
    ])

    /**
     * 评分映射
     */
    static FP_MAP = new Map<int, string>([
        [this.FP_TYPE_GONG, '功法等级评分'],
        [this.FP_TYPE_SORCERY, '妖术评分'],
        [this.FP_TYPE_MAGIC_GET, '神通收集评分'],
        [this.FP_TYPE_MAGIC_WEAR, '神通穿戴评分'],
        [this.FP_TYPE_EQUIP, '装备属性基础评分'],
        [this.FP_TYPE_EQUIP_ENTRY, '装备词条评分'],
        [this.FP_TYPE_EQUIP_EFFECT, '装备效果评分'],
        [this.FP_TYPE_GEM, '宝石评分'],
        [this.FP_TYPE_FASHION, '时装收集评分'],
        [this.FP_TYPE_FASHION_WEAR, '时装穿戴评分'],
        [this.FP_TYPE_WEAPON, '法宝等级评分'],
        [this.FP_TYPE_SOUL_BASE, '器灵基础属性评分'],
        [this.FP_TYPE_SOUL_SPECIAL, '器灵特殊属性评分'],
        [this.FP_TYPE_RARE_GET, '至宝收集评分'],
        [this.FP_TYPE_RARE_WEAR, '至宝穿戴评分'],
        [this.FP_TYPE_LV, '等级评分'],
        [this.FP_TYPE_FREE_ATTR, '自由属性评分'],
        [this.FP_TYPE_MF, '秘法评分'],
    ])

    /**
     * 需要转化的属性类型
     * 属性类型 => 转化率
     */
    static FpConf: Map<number, number>

    static init() {
        this.FpConf = new Map([
            [AttrDefine.Atk, Param.FpAtkRate],
            [AttrDefine.Def, Param.FpDefRate],
            [AttrDefine.Hp, Param.FpHpRate],
        ])
    }

    /**
     * 相关属性转化后评分(力量、耐力、体质)
     * @param attrMap 最新的模块属性信息
     * @returns
     */
    static math_AttrFp(attrMap: Map<int, AttrTypeBean>) {
        attrMap = Attr.convertAttr(attrMap)
        let fp = 0
        for (const [type, rate] of this.FpConf) {
            const val = attrMap.get(type)?.val ?? 0
            fp += (val * rate) / AttributeScale.NUMBER_RATIO
        }
        return Math.floor(fp)
    }

    /**
     * 获取活动冲榜模块评分
     * @param user
     * @param activityName
     * @returns
     */
    static getActivityRankFp(user: User, activityName: string): int {
        let fp = 0
        for (const modId of this.FP_RANK_MAP.get(activityName) ?? []) {
            if (!user.modFps.has(modId)) {
                continue
            }
            fp += user.modFps.get(modId)!.fp ?? 0
        }
        return fp
    }
}
