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
import { RankMetadataStore } from '../../rank/persistence/RankMetadataStore'
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

export class EquipDisplayFormatter {
    // 转化为指定道具

    //#region 装备
    /**
     * 装备显示值
     * @param EquipPropBean equipPropItem
     * @return int
     */
    static showInfo(equipPropItem: EquipPropBean): int {
        let showValue = 0

        // 存在简易
        if (equipPropItem.effects.includes(EquipDefine.EFFECT_ID_8)) {
            showValue |= 1 << EquipDefine.SHOW_TYPE_EFFECT8
        }

        // 存在高级简易
        if (equipPropItem.effects.includes(EquipDefine.EFFECT_ID_9)) {
            showValue |= 1 << EquipDefine.SHOW_TYPE_EFFECT9
        }

        // 存在无级别
        if (equipPropItem.effects.includes(EquipDefine.EFFECT_ID_10)) {
            showValue |= 1 << EquipDefine.SHOW_TYPE_EFFECT10
        }

        // 存在彩色变异
        if (equipPropItem.effects.includes(EquipDefine.EFFECT_ID_21)) {
            showValue |= 1 << EquipDefine.SHOW_TYPE_EFFECT21
        }

        // 破损状态
        if (equipPropItem.durable <= 0) {
            showValue |= 1 << EquipDefine.SHOW_TYPE_BROKEN
        }

        return showValue
    }

    /**
     * 装备展示信息
     * @param HUser|UserBaseRef user
     * @param bool              excludeNoCost 是否排除已损坏或坚不可摧装备
     * @param bool              needId        是否需要唯一id
     * @return array
     */
    static getWearShowInfo(user: User, excludeNoCost: boolean = false, needId: boolean = false) {
        const arr = []
        for (const [, equip] of user.equip.equips) {
            if (!equip.id) {
                continue
            }

            const equipPropItem = user.equip.equipProps.get(equip.id)
            if (equipPropItem == undefined) {
                continue
            }

            if (
                excludeNoCost &&
                !EquipDefine.getEquipDurableCost(user, equipPropItem.durable, equipPropItem.effects.copy())
            ) {
                continue
            }

            const showVal = EquipDisplayFormatter.showInfo(equipPropItem)
            const info = []
            if (needId) {
                info.push([SystemInfoDefine.PARAM_EQUIP_ID, equipPropItem.id])
            }
            info.push([SystemInfoDefine.PARAM_EQUIP_CID, equipPropItem.cId])
            info.push([SystemInfoDefine.PARAM_EQUIP_SHOW_VALUE, showVal])
            arr.push(info)
        }
        return arr
    }

    /**
     * 转换为场景穿戴装备
     * @param user
     * @return array
     */
    static turnSceneEquips(user: User) {
        const pbWear: Map<int, SceneEquip> = new Map()
        const equips = user.equip.equipProps
        for (const [, equip] of user.equip.equips) {
            const equipId = equip.id
            if (!equipId) {
                continue
            }

            const item = equips.get(equipId)
            if (!item) {
                continue
            }

            const sceneEquip = new SceneEquip()
            sceneEquip.toModel(item)
            pbWear.set(equip.pos, sceneEquip)
        }
        return pbWear
    }

    /**
     * 更新穿戴装备排行
     * @param int           uId
     * @param int           pos
     * @param EquipPropBean equipPropItem
     */
    static async updateWearEquipRank(uId: int, pos: int, equipPropItem: EquipPropBean) {
        const showVal = EquipDisplayFormatter.showInfo(equipPropItem)
        const rankType = EquipDefine.POS_TO_RANK.get(pos)!
        const sId = getServerIdByUid(uId)
        const infoId = equipPropItem.id + '-' + equipPropItem.cId + '-' + showVal
        await RankMetadataStore.set(sId, rankType, uId.toString(), equipPropItem.fp, infoId)
    }

    // #endregion

    //#region 装备穿戴表现

    /**
     * 更新穿戴装备表现
     * @param HUser user
     * @return void
     */
    static updateEquipWearShow(user: User) {
        // 表现值
        let showValue = 0

        let allRedNum = 0 // 穿戴红色装备计数
        const allRed = 1 << 1 //EquipWearShowBits.allRed;

        let effectMoreNum = 0 // 穿戴红色装备含三种特效计数
        const effectMore = 1 << 2 //EquipWearShowBits.effectMore;

        let effect21Num = 0 // 穿戴红色装备含彩色变异计数
        const effect21 = 1 << 3 //EquipWearShowBits.effect21;

        const equipProps = user.equip.equipProps
        for (const [, equip] of user.equip.equips) {
            // 是否穿戴装备
            if (equip.id <= 0) {
                continue
            }

            // 装备库中不存在该装备
            const equipProp = equipProps.get(equip.id)
            if (equipProp == null) {
                continue
            }

            // 配置
            const equipConf = C.equip(equipProp.cId)

            // 是否为红色装备
            if (equipConf.quality != EquipDefine.QUALITY_RED) {
                break
            }

            // 穿戴六件红色装备
            if (!(showValue & allRed)) {
                allRedNum++
                if (allRedNum == 6) {
                    showValue |= allRed
                }
            }

            // 当穿戴六件红色装备且每一件装备都存在三个特效
            if (!(showValue & effectMore) && equipProp.effects.length() >= 3) {
                effectMoreNum++
                if (effectMoreNum == 6) {
                    showValue |= effectMore
                }
            }

            // 当穿戴六件红色装备且每一件装备都存在【彩色变异】特效
            if (!(showValue & effect21) && equipProp.effects.includes(EquipDefine.EFFECT_ID_21)) {
                effect21Num++
                if (effect21Num == 6) {
                    showValue |= effect21
                }
            }
        }

        // 更新玩家数据
        user.equip.equipWearShow = showValue

        // 同步战场
    }
}
