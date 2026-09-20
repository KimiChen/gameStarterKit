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

export class EquipDissolve {
    // #endregion

    //#region 溶解
    /**
     * 检查是否满足溶解条件
     * @param HUser         user
     * @param EquipPropItem equip
     * @return bool
     */
    static checkDissolveCondition(user: User, equip: EquipPropBean): boolean {
        const equipConf = C.equip(equip.cId)
        if (!(user.equip.equipAutoDissolve.get(equipConf.quality)?.enable ?? 0)) {
            // 为设置品质等级、或设置了未开启溶解
            return false
        }

        // 没开评分比较，直接溶解对应品质的装备
        if (!user.equip.isOpenFpDissolve) {
            return true
        }

        const wearId = user.equip.equips.get(equipConf.position)?.id ?? 0

        // 该部位没穿戴不溶解
        if (!wearId) {
            return false
        }

        // 同步位装备评分小于新装备的评分则溶解
        return equip.fp < (user.equip.equipProps.get(wearId)?.fp ?? 0)
    }

    /**
     * 装备溶解
     * @param HUser user
     * @param int   propId
     * @param int   num
     */
    static async equipDissolve(user: User, propId: int, num: int): Promise<void> {
        // 装备配置
        const equipConf = C.equip(propId)

        // 溶解后的材料-陨铁
        const awards: PropItem[] = []
        for (const award of equipConf.award) {
            awards.push({
                propId: award.propId,
                num: award.num * num,
            })
        }

        // 奖励发放
        await Props.addProps(user, awards)
    }
}
