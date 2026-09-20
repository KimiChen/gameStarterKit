import { ActivityRankUpdate } from '../../activity/rank/ActivityRankUpdate'
import { ActivityDefine } from '../../activity/rules/ActivityDefine'
import { FeatureAccess } from '../../user/access/FeatureAccess'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { GameRandom } from '../../../runtime/random/GameRandom'
import { AttrTypeBean } from '../../attr/bean/AttrTypeBean'
import { Attr } from '../../attr/calculation/Attr'
import { AttrDefine } from '../../attr/rules/AttrDefine'
import { AttrModDefine } from '../../attr/rules/AttrModDefine'
import { AttributeScale } from '../../attr/rules/AttributeScale'
import { Props } from '../../props/inventory/Props'
import { ItemIdDefine } from '../../props/rules/ItemIdDefine'
import { ModuleOpenType } from '../../user/access/ModuleOpenType'
import { UserFp } from '../../user/action/UserFp'
import { User } from '../../user/bean/User'
import { PowerScoreRules } from '../../user/rules/PowerScoreRules'
import { WeaponErrors } from '../WeaponErrors'
import { RareBean } from '../bean/RareBean'
import { WeaponSoulBean } from '../bean/WeaponSoulBean'

/**
 * 器灵法宝
 */
export class WeaponProgression {
    /**
     * 额外使用道具
     */
    static readonly ADDITION_PROP = [ItemIdDefine.ITEM_ID_CLEANSE_NEGTIVE, ItemIdDefine.ITEM_ID_CLEANSE_POSTIVE]

    /**
     * 获取基础属性
     * @param qualityId 器灵Id
     */
    static getBaseAttrItem(qualityId: int) {
        const conf = C.weapon_soul_attribute(qualityId)

        // 随机属性类型
        const attrConf = GameRandom.randomByWeightConfig(conf.mAttr)

        // 随机属性值比例
        const rankAttrConf = GameRandom.randomByWeightConfig(conf.rankAttr)
        const rankAttr = rankAttrConf!.attr / AttributeScale.NUMBER_RATIO

        // 器灵基础属性=minAttr+(maxAtt-minAttr)*rankAttr的随机值，取整数
        const val = conf.minAttr + (conf.maxAtt - conf.minAttr) * rankAttr

        return new AttrTypeBean({
            type: attrConf?.attrType,
            val: val,
        })
    }

    static getSoulAttrs(user: User) {
        const attrMap: Map<int, AttrTypeBean> = new Map()
        for (const [, soul] of user.weapon.souls) {
            for (const [, attr] of soul.attrs) {
                attrMap.set(attr.type, attr)
            }
        }
        return attrMap
    }

    static getSoul(user: User, slotId: int) {
        const soul = user.weapon.souls.get(slotId)
        // 坑位未开启
        if (soul == null) {
            throw WeaponErrors.WeaponNoOpenSlot
        }
        return soul
    }

    /**
     * 卸下至宝
     * @param user
     */
    static unloadRare(user: User) {
        user.weapon.rareId = 0

        // 同步场景

        //更新评分
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_RARE_WEAR)
    }

    /**
     * 添加至宝
     * @param user
     * @param cId
     * @param num
     */
    static addRare(user: User, cId: int, num: int) {
        const conf = C.weapon_valuable(cId)
        const durable = conf.durable

        if (!user.weapon.rares.has(cId)) {
            user.weapon.rares.set(
                cId,
                new RareBean({
                    rareId: cId,
                    durable: durable,
                }),
            )

            // 更新属性
            Attr.updateAttrModItem(user, AttrModDefine.Rare, AttrDefine.getBaseAttr(conf.baseAttr))

            // 更新评分
            UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_RARE_GET)

            num--
        }

        if (num <= 0) return

        // 已拥有转为耐久度
        Props.changeDurable(user, cId, num * durable, ItemIdDefine.DURABLE_FIELD_NAME.rareItems)
    }

    /**
     * 根据品质获得器灵属性
     * @param qualityId
     */
    static makeSoul(qualityId: int): [attrs: Map<int, AttrTypeBean>, fp: int] {
        const conf = C.weapon_soul_attribute(qualityId)

        const attrs: Map<int, AttrTypeBean> = new Map()

        // 获取基础属性
        const baseAttr = this.getBaseAttrItem(qualityId)
        attrs.set(baseAttr.type, baseAttr)

        // 没有特殊属性
        if (conf.specialAttr.length == 0) {
            return [attrs, 0]
        }

        // 获取特殊属性
        const [specialAttr, specialFp] = this.getSpecialAttrsAndFp(qualityId)
        attrs.set(specialAttr.type, specialAttr)

        return [attrs, specialFp]
    }

    /**
     * 获取特殊属性
     * @param qualityId
     * @returns
     */
    static getSpecialAttrsAndFp(qualityId: int): [specialAttr: AttrTypeBean, specialFp: int] {
        const conf = C.weapon_soul_attribute(qualityId)
        const attrConf = GameRandom.randomByWeightConfig(conf.specialAttr)
        const attrItem = new AttrTypeBean({
            type: attrConf!.attrType,
            val: attrConf!.attrValue,
        })
        return [attrItem, attrConf!.fp]
    }

    /**
     * 判断当前经验是否满足指定的showLv
     * @param user
     * @param lv
     */
    static checkNeedExpByLv(user: User, lv: int) {
        if (lv == user.weapon.lv) {
            // 无需额外再多的经验
            return true
        }
        let wLv = user.weapon.lv
        let needExp = 0
        let currentConf = C.weapon(wLv)
        do {
            currentConf = C.weapon(wLv)
            needExp += currentConf.costNum
            wLv++
        } while (lv > currentConf.id)

        return user.sc >= needExp
    }

    /**
     * 器灵开启埋点
     * @param user
     */
    static openSoul(user: User) {
        if (!FeatureAccess.check(user, ModuleOpenType.SYS_SOUL)) {
            return
        }

        const slotId = user.weapon.souls.size() + 1

        if (slotId > C.weapon_soul_open().end().id) {
            return
        }

        // 条件不足
        // const openConf = C.weapon_soul_open(slotId)
        // if (user.weapon.weaponLv < openConf.weaponLevel) {
        //     return
        // }

        if (user.weapon.souls.has(slotId)) {
            return
        }

        const qualityId = Param.WeaponOpenQuality

        // 获取器灵
        const [attrs, specialFp] = WeaponProgression.makeSoul(qualityId)
        const fp = PowerScoreRules.math_AttrFp(attrs) + specialFp
        const soul = new WeaponSoulBean()
        soul.id = slotId
        soul.attrs.init(attrs)
        soul.quality = qualityId
        soul.baseFp = fp
        user.weapon.souls.set(slotId, soul)

        this.soulOpened(user)
    }

    static async levelUp(user: User, level: int) {
        const levelConfig = C.weapon(level)
        Attr.updateAttrModItem(user, AttrModDefine.Weapon, AttrDefine.attrsFromArrOrObj(levelConfig))
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_WEAPON)
        await ActivityRankUpdate.run(user, [ActivityDefine.RankWeapon], levelConfig.showLv)
        await ActivityRankUpdate.run(
            user,
            [ActivityDefine.RankWeaponFp],
            PowerScoreRules.getActivityRankFp(user, ActivityDefine.RankWeaponFp),
        )
    }

    private static soulOpened(user: User) {
        Attr.updateAttrModItem(user, AttrModDefine.Soul, this.getSoulAttrs(user))
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_SOUL_BASE)
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_SOUL_SPECIAL)
    }

    /**
     * 获取器灵品质
     */
    static async getQuality(user: User, propId: int, soul: WeaponSoulBean) {
        // 消耗额外道具
        if (propId > 0) {
            if (!this.ADDITION_PROP.includes(propId)) {
                throw SystemErrors.SysParamError
            }

            const qualityId = soul.quality
            const qualityConf = C.weapon_soul_attribute(qualityId)

            // 该品质的器灵无特殊属性，无法使用阳舍利
            if (!qualityConf.specialAttr && propId == ItemIdDefine.ITEM_ID_CLEANSE_POSTIVE) {
                throw SystemErrors.SysParamError
            }

            await Props.costProp(user, propId, 1)
            return qualityId
        }

        // 洗练次数+1
        user.weapon.baseBigNum++
        user.weapon.baseSmallNum++

        let quality
        if (user.weapon.baseSmallNum >= Param.WeaponSmallBaseNum) {
            // 小保底
            quality = Param.WeaponSmallBaseQuality
            user.weapon.baseSmallNum = 0
        } else if (user.weapon.baseBigNum >= Param.WeaponBigBaseNum) {
            // 大保底
            quality = Param.WeaponBigBaseQuality
            user.weapon.baseBigNum = 0
        } else {
            // 随机一个品质
            const confs = C.weapon_soul_extract().arrayValues()
            const randomQualityCfg = GameRandom.randomByWeightConfig(confs)
            quality = randomQualityCfg.id
        }

        return quality
    }

    /**
     * 阳舍利洗炼
     * @param user
     * @param qualityId
     * @param soul
     * @returns
     */
    static posPropSoul(qualityId: int, soul: WeaponSoulBean): [attrs: Map<int, AttrTypeBean>, fp: int] {
        const newAttrs: Map<int, AttrTypeBean> = new Map()
        for (const [key, attr] of soul.attrs) {
            // 保留之前的基础属性
            if (!AttrDefine.Base_Attr_Types.includes(attr.type)) {
                continue
            }
            newAttrs.set(key, attr)
        }

        const [specialAttr, specialFp] = WeaponProgression.getSpecialAttrsAndFp(qualityId)
        newAttrs.set(specialAttr.type, specialAttr)
        return [newAttrs, specialFp]
    }
}
