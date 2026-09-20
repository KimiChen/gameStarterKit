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
import { EquipDissolve } from './EquipDissolve'
import { EquipEntryGenerator } from './EquipEntryGenerator'
import { EquipPowerCalculator } from './EquipPowerCalculator'

/**
 * 装备获得去处
 */
interface EquipPlacementOutcome {
    /** 进入背包 */
    bag: int[]
    /** 转到邮件 */
    mail: int
    /** 自动溶解 */
    dissolve: int
    /** 修炼装备 */
    practice: int
}

export class EquipInventoryStore {
    // 装备获得去处
    static readonly DATA_LABEL_BAG = 1

    // 进入背包

    static readonly DATA_LABEL_MAIL = 2

    // 转到邮件

    static readonly DATA_LABEL_DISSOLVE = 3

    // 自动溶解

    static readonly DATA_LABEL_PRACTICE = 4

    // 修炼装备

    static readonly DATA_LABEL_COVERT = 5

    // #endregion

    //#region 添加装备
    /**
     * 新增装备库
     * @param HUser user
     * @param int   cId
     * @param int   addNum
     * @param array propDataInfo
     * @return array
     * @throws \Throwable
     */
    static async addEquipProp(user: User, cId: int, addNum: int, propDataInfo?: PropsExtra) {
        const extraData: EquipPlacementOutcome = {
            bag: [],
            mail: 0,
            dissolve: 0,
            practice: 0,
        }

        // 超出的部分走邮件
        const mailNum = EquipInventoryStore.getEquipNum(user) + addNum - Param.EquipNumMax
        let addEquipNum = addNum
        if (mailNum > 0) {
            // Push.sendSystemInfoById(
            //     SystemInfoDefine.EquipOverMail_43,
            //     [],
            //     [
            //         Push.ARGS_AWARDS => [PropItem.new(cId, mailNum)],
            //         Push.ARGS_UIDS => [user.id]
            //     ]
            // );
            addEquipNum = addNum - mailNum
            extraData.mail = mailNum
        }

        // 没有要添加的装备
        if (addEquipNum <= 0) {
            return extraData
        }

        const equipConf = C.equip(cId)
        const itemConf = C.item(cId)

        // 包含被溶解装备列表
        const newEquipsInclDis: Map<int, EquipPropBean> = new Map()
        const equipAttrConf = C.equip_attr_rank(itemConf.quality)
        for (let i = 0; i < addEquipNum; i++) {
            const equipPropItem = new EquipPropBean()
            equipPropItem.cId = cId
            // 初始化耐久
            equipPropItem.durable = equipConf.durable

            // 装备基础属性
            for (const [attrType, minVal, maxVal] of equipConf.attr) {
                // 无需运算
                if (!maxVal && !minVal) {
                    continue
                }

                if (maxVal < minVal) {
                    // 存在配置问题
                    continue
                }

                let rankValue = 0
                if (equipAttrConf.rankAttr) {
                    const randomConf = GameRandom.randomByWeightConfig(equipAttrConf.rankAttr)
                    rankValue = randomConf.attr ?? 0
                }

                const attrValue = Int(minVal + ((maxVal - minVal) * rankValue) / AttributeScale.NUMBER_RATIO)
                equipPropItem.attr.set(attrType, new AttrTypeBean({ type: attrType, val: attrValue }))
            }

            // 装备效果
            let effects: int[] | undefined = []
            if (propDataInfo != null && (propDataInfo.practiceEffectIds?.length ?? 0 > 0)) {
                // 是否修炼装备
                effects = propDataInfo.practiceEffectIds ?? []
            } else {
                effects = EquipEntryGenerator.randomEffects(equipConf, propDataInfo?.equipDrawData ?? [])
            }
            effects && equipPropItem.effects.init(effects)

            // 装备词条
            const entries = EquipEntryGenerator.randomEntries(equipConf, effects)
            equipPropItem.entries.init(entries)

            // 装备评分计算
            EquipPowerCalculator.calculateEquipFp(equipPropItem)

            // 收集包含被溶解的新装备
            newEquipsInclDis.set(equipPropItem.id, equipPropItem)

            // 满足溶解条件，溶解装备
            if (EquipDissolve.checkDissolveCondition(user, equipPropItem)) {
                await EquipDissolve.equipDissolve(user, equipPropItem.cId, 1)
                extraData.dissolve++
                continue
            }

            // 获得装备
            equipPropItem.id = user.equip.equipProps.maxKey() + 1
            user.equip.equipProps.set(equipPropItem.id, equipPropItem)
            extraData.bag.push(equipPropItem.id)

            // 彩色变异装备推送
            if (equipPropItem.effects.includes(EquipDefine.EFFECT_ID_21)) {
                // Push.sendSystemInfoById(
                //     SystemInfoDefine.EquipEffect_66,
                //     [
                //         [SystemInfoDefine.PARAM_DEFAULT, user.name],
                //         [SystemInfoDefine.PARAM_EQUIP_CID, cId],
                //     ]
                // );
                // 任务更新
                // TaskHelper.update(user, 1, TaskDefine.TARGET_1075_EQUIP_COLOR);
            }
        }

        // 溶解任务埋点
        if (extraData.dissolve > 0) {
            // TaskHelper.update(user, extraData.dissolve, TaskDefine.TARGET_1025_SMELTING_EQUIPMENT);
        }

        // 任务埋点
        // UserEvent.addEquip(user, newEquipsInclDis);

        // 数数,上报未被溶解进入背包的装备
        if (extraData.bag.length > 0) {
            // TaModuleEquip.equipAppraisal(user, equipConf, extraData.bag);
        }

        return extraData
    }

    /**
     * 获取装备拥有数量
     * @param HUser user
     * @return int
     */
    static getEquipNum(user: User): int {
        const equipPropNum = user.equip.equipProps.size()

        let n = 0
        for (const [, equip] of user.equip.equips) {
            if (equip.id <= 0) {
                continue
            }
            if (!user.equip.equipProps.has(equip.id)) {
                continue
            }
            n++
        }
        return equipPropNum - n
    }

    /**
     * 校验该装备唯一ID是否穿戴
     * @param user
     * @param eId 装备Id
     * @returns
     */
    static checkEquipWearEId(user: User, eId: int): boolean {
        // 坑位信息
        if (user.equip.equips.size() == 0) {
            return false
        }

        // 装备信息
        const equipPropItem = user.equip.equipProps.get(eId)
        if (!equipPropItem || equipPropItem.cId) {
            return false
        }

        // 装备配置
        const equipConf = C.equip(equipPropItem.cId)

        // 装备所属坑位
        const pos = equipConf.position ?? 0
        if (EquipDefine.EQUIP_POSITION.has(pos)) {
            return false
        }

        const equipItem = user.equip.equips.get(pos)
        // 坑位是否已初始化
        if (!equipItem) {
            return false
        }

        // 判断是否坑位装备是否相同
        if (equipItem.id != eId) {
            return false
        }

        return true
    }
}
