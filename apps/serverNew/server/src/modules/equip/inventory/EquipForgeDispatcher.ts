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

export class EquipForgeDispatcher {
    // #endregion

    //#region 炼器
    /**
     * 装备打造
     * @param user
     * @param drawType
     * @param poolId
     * @param propUseId
     * @param res
     * @returns
     */
    static async forge(user: User, drawType: int, poolId = 1, propUseId = 0, res?: AwardResponse) {
        // 实例化抽奖对象
        let forgeEquip
        if (propUseId) {
            forgeEquip = new EquipForgeUseProp(user, drawType, poolId, propUseId, res)
        } else {
            forgeEquip = new EquipForge(user, drawType, poolId, propUseId, res)
        }

        // 检查是否符合可打造
        forgeEquip.check()

        // 扣除消耗
        await forgeEquip.cost()

        // 池重组
        forgeEquip.rebuildPool()

        // 开始打造
        await forgeEquip.draw()

        // 打造后事件
        forgeEquip.afterEvent()

        return forgeEquip
    }
}
