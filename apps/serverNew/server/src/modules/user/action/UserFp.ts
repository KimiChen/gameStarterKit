import { AttrTypeBean } from '../../attr/bean/AttrTypeBean'
import { Attr } from '../../attr/calculation/Attr'
import { AttrDefine } from '../../attr/rules/AttrDefine'
import { AttrModDefine } from '../../attr/rules/AttrModDefine'
import { EquipDefine } from '../../equip/rules/EquipDefine'
import { UserErrors } from '../UserErrors'
import { ModFpBean } from '../bean/ModFpBean'
import { User } from '../bean/User'
import { PowerScoreRules } from '../rules/PowerScoreRules'

type FpUpdateMod = {
    [key: string]: (user: User) => [fp: int, realmFp: int]
}

export class UserFp {
    static readonly fpMethodMap: FpUpdateMod = {
        1: this.updateModFp_1,
        2: this.updateModFp_2,
        4: this.updateModFp_4,
        5: this.updateModFp_5,
        6: this.updateModFp_6,
        7: this.updateModFp_7,
        8: this.updateModFp_8,
        9: this.updateModFp_9,
        10: this.updateModFp_10,
        11: this.updateModFp_11,
        12: this.updateModFp_12,
        13: this.updateModFp_13,
        14: this.updateModFp_14,
        15: this.updateModFp_15,
        16: this.updateModFp_16,
        17: this.updateModFp_17,
        18: this.updateModFp_18,
        19: this.updateModFp_19,
    }

    /**
     * 更新玩家评分
     * @param user
     * @param fpModId
     * @param params
     */
    static updateUserFp(user: User, fpModId: int) {
        if (!this.fpMethodMap[fpModId]) {
            throw UserErrors.UserFpMethodNotExsit
        }

        let fpModItem = user.modFps.get(fpModId)
        if (fpModItem == null) {
            fpModItem = new ModFpBean({ id: fpModId })
            user.modFps.set(fpModId, fpModItem)
        }

        let realmModItem = user.modRealmUpFps.get(fpModId)
        if (realmModItem == null) {
            realmModItem = new ModFpBean({ id: fpModId })
            user.modRealmUpFps.set(fpModId, realmModItem)
        }

        const [modFp, modRealmFp] = this.fpMethodMap[fpModId](user)

        // 更新基础评分
        fpModItem.fp = modFp

        // 更新境界提升后的评分
        realmModItem.fp = modRealmFp

        //更新总评分
        let totalFp = 0
        for (const [, item] of user.modFps) {
            totalFp += item.fp
        }

        let totalRealmFp = 0
        for (const [, item] of user.modRealmUpFps) {
            totalRealmFp += item.fp
        }

        user.fp = totalFp
        user.realmUpFp = totalRealmFp

        //更新历史最大值
        if (user.fp > user.maxFp) {
            user.maxFp = user.fp
        }
        if (user.realmUpFp > user.maxRealmUpFp) {
            user.maxRealmUpFp = user.realmUpFp
        }
    }

    /**
     * 重算玩家战力
     * @param user
     */
    static recalFp(user: User) {
        for (const [fpModId] of PowerScoreRules.FP_MAP) {
            this.updateUserFp(user, fpModId)
        }
    }

    //#region 各模块评分计算方法

    /** 功法等级评分 */
    static updateModFp_1(user: User): [number, number] {
        const baseAttrs = Attr.getAttrModItem(user, AttrModDefine.Gong)!.attrs.copy()
        const realmUpAttrs = Attr.getAttrsRealmUp(user, baseAttrs)
        return [PowerScoreRules.math_AttrFp(baseAttrs), PowerScoreRules.math_AttrFp(realmUpAttrs)]
    }

    /** 妖术评分(读表评分) */
    static updateModFp_2(user: User): [number, number] {
        let sorceryFp = 0
        for (const sorcery of user.gong.sorceryList) {
            sorceryFp += C.gong_sorcery(sorcery)?.fp ?? 0
        }
        return [sorceryFp, sorceryFp]
    }

    /** 神通穿戴评分（读表评分） */
    static updateModFp_4(user: User): [number, number] {
        // 神通读表评分 （ 仅计算穿戴的 ）
        const magicFp = C.gong_magical(user.gong.magicId)?.fp ?? 0
        return [magicFp, magicFp]
    }

    /** 装备属性评分 */
    static updateModFp_5(user: User): [number, number] {
        let equipFp = 0
        let realmFp = 0
        const equipProps = user.equip.equipProps
        for (const [, equip] of user.equip.equips) {
            if (equip.id <= 0) {
                continue
            }
            if (!equipProps.has(equip.id)) {
                continue
            }

            const equipItem = equipProps.get(equip.id)!
            const realmAttrs = Attr.getAttrsRealmUp(user, equipItem.attr.copy())
            realmFp += PowerScoreRules.math_AttrFp(realmAttrs)
            equipFp += equipItem.attrFp
        }
        return [equipFp, realmFp]
    }

    /** 宝石评分 */
    static updateModFp_6(user: User): [number, number] {
        let baseFp = 0
        let realmUpFp = 0
        const equipProps = user.equip.equipProps
        for (const [, equip] of user.equip.equips) {
            if (!equip.gemId) {
                continue
            }

            const attrMap: Map<int, AttrTypeBean> = new Map()

            if (equip.id <= 0) {
                continue
            }
            // 装备库中不存在该装备
            if (!equipProps.has(equip.id)) {
                continue
            }

            const equipGemConf = C.equip_gem(equip.pos)
            const moreConf = equipGemConf.more.get(equip.gemId)
            EquipDefine.gemImproveBaseAttrs(moreConf, equipProps.get(equip.id)!, attrMap)

            // 基础评分
            baseFp += PowerScoreRules.math_AttrFp(attrMap)

            // 境界提升评分
            realmUpFp += PowerScoreRules.math_AttrFp(Attr.getAttrsRealmUp(user, attrMap))
        }

        return [baseFp, realmUpFp]
    }

    /** 时装评分 */
    static updateModFp_7(user: User): [number, number] {
        // 属性评分
        let baseFp = 0
        let realmUpFp = 0
        for (const [, fashion] of user.fashion.fashions) {
            const attrs: Map<int, AttrTypeBean> = new Map()
            if (!fashion.cId) {
                continue
            }
            // 处理基础属性(大招减益战场中处理)
            const equipFashionConf = C.equip_fashion(fashion.cId)
            EquipDefine.fashionAttrs(equipFashionConf, attrs)

            // 基础评分
            baseFp += PowerScoreRules.math_AttrFp(attrs)

            // 境界提升评分
            realmUpFp += PowerScoreRules.math_AttrFp(Attr.getAttrsRealmUp(user, attrs))
        }

        return [baseFp, realmUpFp]
    }

    /** 法宝等级评分 */
    static updateModFp_8(user: User): [number, number] {
        const baseAttrs = Attr.getAttrModItem(user, AttrModDefine.Weapon).attrs.copy()
        const realmUpAttrs = Attr.getAttrsRealmUp(user, baseAttrs)
        return [PowerScoreRules.math_AttrFp(baseAttrs), PowerScoreRules.math_AttrFp(realmUpAttrs)]
    }

    /** 器灵基础属性评分 */
    static updateModFp_9(user: User): [number, number] {
        let fp = 0
        let realmUpFp = 0
        for (const [, soul] of user.weapon.souls) {
            fp += soul.baseFp
            const realmUpAttrs = Attr.getAttrsRealmUp(user, soul.attrs.copy())
            realmUpFp += PowerScoreRules.math_AttrFp(realmUpAttrs)
        }
        return [fp, realmUpFp]
    }

    /** 至宝穿戴评分（读表评分） */
    static updateModFp_10(user: User): [number, number] {
        if (user.weapon.rareId == 0) {
            return [0, 0]
        }
        const fp = C.weapon_valuable(user.weapon.rareId)?.fp ?? 0
        return [fp, fp]
    }

    /** 等级评分 */
    static updateModFp_11(user: User): [number, number] {
        const baseAttrs = Attr.getAttrModItem(user, AttrModDefine.UserLv)!.attrs.copy()
        const realmUpAttrs = Attr.getAttrsRealmUp(user, baseAttrs)
        return [PowerScoreRules.math_AttrFp(baseAttrs), PowerScoreRules.math_AttrFp(realmUpAttrs)]
    }

    /** 等自由属性评分 */
    static updateModFp_12(user: User): [number, number] {
        const baseAttrs = Attr.getAttrModItem(user, AttrModDefine.Addition).attrs.copy()
        const realmUpAttrs = Attr.getAttrsRealmUp(user, baseAttrs)
        return [PowerScoreRules.math_AttrFp(baseAttrs), PowerScoreRules.math_AttrFp(realmUpAttrs)]
    }

    /** 秘法评分 */
    static updateModFp_13(user: User): [number, number] {
        let mfFp = 0
        for (const [mfId, mfLv] of user.guildMFList) {
            mfFp += C.guild_mf(mfId).lv.get(mfLv).fp ?? 0
        }
        return [mfFp, mfFp]
    }

    /** 神通收集评分（属性评分） */
    static updateModFp_14(user: User): [number, number] {
        let fp = 0
        let realmFp = 0
        for (const [, magic] of user.gong.magics) {
            const baseAttrs = AttrDefine.getBaseAttr(C.gong_magical(magic.magicId).baseAttr)
            const realmUpAttrs = Attr.getAttrsRealmUp(user, baseAttrs)
            fp += PowerScoreRules.math_AttrFp(baseAttrs)
            realmFp += PowerScoreRules.math_AttrFp(realmUpAttrs)
        }
        return [fp, realmFp]
    }

    /** 至宝收集评分（属性评分） */
    static updateModFp_15(user: User): [number, number] {
        let fp = 0
        let realmFp = 0
        for (const [, rare] of user.weapon.rares) {
            const baseAttrs = AttrDefine.getBaseAttr(C.weapon_valuable(rare.rareId).baseAttr)
            const realmUpAttrs = Attr.getAttrsRealmUp(user, baseAttrs)
            fp += PowerScoreRules.math_AttrFp(baseAttrs)
            realmFp += PowerScoreRules.math_AttrFp(realmUpAttrs)
        }
        return [fp, realmFp]
    }

    /** 装备词条评分 */
    static updateModFp_16(user: User): [number, number] {
        // 装备评分
        let equipFp = 0
        let realmUpFp = 0
        const equipProps = user.equip.equipProps
        for (const [, equip] of user.equip.equips) {
            if (equip.id <= 0) {
                continue
            }
            const equipProp = equipProps.get(equip.id)
            if (!equipProp) {
                continue
            }
            equipFp += equipProp.entryFp

            // 计算境界提升后的评分
            for (const [, entry] of equipProp.entries) {
                const realmUpAttrs = Attr.getAttrsRealmUp(user, entry.attrMap.copy())
                realmUpFp += PowerScoreRules.math_AttrFp(realmUpAttrs)
            }
        }
        return [equipFp, realmUpFp]
    }

    /** 装备效果评分 */
    static updateModFp_17(user: User): [number, number] {
        let equipEffectFp = 0
        const equipProps = user.equip.equipProps
        for (const [, equip] of user.equip.equips) {
            if (equip.id <= 0) {
                continue
            }
            const equipProp = equipProps.get(equip.id)
            if (!equipProp) {
                continue
            }
            // 非提升评分
            equipEffectFp += equipProp.effectFp
        }
        return [equipEffectFp, equipEffectFp]
    }

    /** 时装穿戴评分 */
    static updateModFp_18(user: User): [number, number] {
        // 穿戴评分
        let fashionFp = 0
        for (const [, fashionW] of user.fashion.fashionWear) {
            if (fashionW.cId <= 0) {
                continue
            }
            const fashionConf = C.equip_fashion(fashionW.cId)
            fashionFp += fashionConf.fp
        }
        return [fashionFp, fashionFp]
    }

    /** 器灵特殊属性评分 */
    static updateModFp_19(user: User): [number, number] {
        let fp = 0
        for (const [, soul] of user.weapon.souls) {
            fp += soul.specialFp
        }
        return [fp, fp]
    }
    //#endregion
}
