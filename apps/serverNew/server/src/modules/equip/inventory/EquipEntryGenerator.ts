import { UtilObject, getServerIdByUid } from '@arthropoda/game-engine'
import { AwardResponse, PropItem } from '../../../runtime/protocol/C2S/commom'
import { GameRandom } from '../../../runtime/random/GameRandom'
import { ActivityRankUpdate } from '../../activity/rank/ActivityRankUpdate'
import { ActivityDefine } from '../../activity/rules/ActivityDefine'
import { AttrTypeBean } from '../../attr/bean/AttrTypeBean'
import { Attr } from '../../attr/calculation/Attr'
import { AttrDefine } from '../../attr/rules/AttrDefine'
import { AttrModDefine } from '../../attr/rules/AttrModDefine'
import { AttributeScale } from '../../attr/rules/AttributeScale'
import { Props, PropsExtra } from '../../props/inventory/Props'
import { ItemIdDefine } from '../../props/rules/ItemIdDefine'
import { SceneEquip } from '../../scene/model/SceneEquip'
import { SystemInfoDefine } from '../../serverSettings/runtime/SystemInfoDefine'
import { UserEvil } from '../../user/action/UserEvil'
import { UserFp } from '../../user/action/UserFp'
import { UserAppearance } from '../../user/action/UserAppearance'
import { User } from '../../user/bean/User'
import { PowerScoreRules } from '../../user/rules/PowerScoreRules'
import { EquipErrors } from '../EquipErrors'
import { EntryBean } from '../bean/EntryBean'
import { EquipPropBean } from '../bean/EquipPropBean'
import { FashionBean } from '../bean/FashionBean'
import { FashionWearBean } from '../bean/FashionWearBean'
import { EquipForge } from '../forge/EquipForge'
import { EquipForgeUseProp } from '../forge/EquipForgeUseProp'
import { EquipDefine } from '../rules/EquipDefine'

export class EquipEntryGenerator {
    /**
     * 随机装备词条
     * @param IConfEquip equipConf
     * @param Array     effectIds 装备效果：检查是否存在效果添加额外词条
     * @return array
     */
    static randomEntries(equipConf: IConfEquip, effectIds: Array<int> = []) {
        const entries: Map<int, EntryBean> = new Map()
        if (equipConf.entryRankId <= 0) {
            return entries
        }

        let index = 1

        // 1.随机词条数量
        const entryCallConf = C.equip_entry_call(equipConf.entryRankId)
        /** @var EquipEntryCallMoreConf entryRand */
        const entryRand = GameRandom.randomByWeightConfig(entryCallConf.more)
        // 2.开始随机词条数值
        for (let j = 0; j < entryRand.times; ++j) {
            const entryItem = EquipEntryGenerator.equipEntryItemFormat(entryRand.cId)
            if (entryItem) {
                entryItem.cId = index
                entries.set(entryItem.cId, entryItem)
                index++
            }
        }

        // 装备存在效果祝福时，词条库中随机新增N词条
        for (const effectId of effectIds) {
            // 获取效果配置
            const equipEffectConf = C.equip_effect(effectId)
            // 该效果为祝福时，词条库中随机新增N词条
            if (equipEffectConf.type != EquipDefine.EFFECT_ADD_ENTRY) {
                continue
            }
            for (let i = 0; i < equipEffectConf.value1; ++i) {
                const entryItem = EquipEntryGenerator.equipEntryItemFormat(entryCallConf.entryId, 1)
                if (entryItem) {
                    entryItem.cId = index
                    entries.set(entryItem.cId, entryItem)
                    index++
                }
            }
        }

        return entries
    }

    /**
     * 随机装备效果
     * @param EquipConf equipConf
     * @param array     addEffectIds 必得特效，占用随机次数
     * @param int       baseTimes    保底特效个数
     * @return array
     */
    static randomEffects(equipConf: IConfEquip, addEffectIds: number[] = [], baseTimes = 0) {
        if (equipConf.effectRankId <= 0) {
            return []
        }
        const effects: number[] = []

        // 必得特效，占用随机次数
        if (addEffectIds) {
            for (const addEffectId of addEffectIds) {
                if (!effects.includes(addEffectId)) {
                    effects.push(addEffectId)
                }
            }
        }

        // 1.随机效果数量
        const effectCallConf = C.equip_effect_call(equipConf.effectRankId)
        const effectRand = GameRandom.randomByWeightConfig(effectCallConf.more)

        // 效果随机次数
        if (!baseTimes) {
            baseTimes = effectRand.times
        }
        const times = baseTimes - effects.length

        // 2.开始随机效果数值
        for (let k = 0; k < times; ++k) {
            const effectId = EquipEntryGenerator.equipEffectFormat(effectRand.cId, effects)
            if (effectId > 0 && !effects.includes(effectId)) {
                effects.push(effectId)
            }
        }

        return effects
    }

    /**
     * 装备词条添加
     * @param int entryId
     * @param int isEffect
     * @return EntryBean|undefined
     */
    static equipEntryItemFormat(entryId: int, isEffect = 0) {
        if (!entryId) {
            return undefined
        }

        const entryConf = C.equip_entry(entryId)
        if (entryConf.mAttr.length == 0) {
            return undefined
        }

        const entryItem = new EntryBean()
        // 配表ID
        entryItem.id = entryId

        /** @var EquipEntryMAttrConf mAttrRand */
        const mAttrRand = GameRandom.randomByWeightConfig(entryConf.mAttr)

        const entryAttrVal = GameRandom.rand(entryConf.minAttr, entryConf.maxAttr)

        entryItem.attrMap.set(
            mAttrRand.attrType,
            new AttrTypeBean({
                type: mAttrRand.attrType,
                val: entryAttrVal,
            }),
        )

        entryItem.isEffect = isEffect

        return entryItem
    }

    /**
     * 装备效果添加
     * @param effectRandId
     * @param curEffects
     * @returns
     */
    static equipEffectFormat(effectRandId: int, curEffects: int[]): int {
        if (effectRandId == 0) {
            return 0
        }

        const effectRankConf = C.equip_effect_rank(effectRandId)
        if (effectRankConf.rank.size == 0) {
            return 0
        }

        let randomConf = effectRankConf.rank.arrayValues()
        // 多次随机装备效果，随机到的类型唯一
        if (curEffects.length > 0) {
            // 相同归属类型剔除
            const removeTypes: number[] = [] // 需要剔除的类型
            for (const value of curEffects) {
                const rankConf = effectRankConf.rank.get(value)!
                removeTypes.push(rankConf.type)
            }

            randomConf = randomConf.filter((e) => {
                return removeTypes.includes(e.type)
            })
        }

        const rankRand = GameRandom.randomByWeightConfig(randomConf)
        if (rankRand == null) {
            return 0
        }

        return rankRand.effectId
    }
}
