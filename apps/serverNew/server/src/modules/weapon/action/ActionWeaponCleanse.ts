import { AttrTypeBean } from '../../attr/bean/AttrTypeBean'
import { PowerScoreRules } from '../../user/rules/PowerScoreRules'
import { ItemIdDefine } from '../../props/rules/ItemIdDefine'
import { GameAction } from '../../../runtime/action/GameAction'
import { Props } from '../../props/inventory/Props'
import { ReqWeaponCleanse, ResWeaponCleanse } from '../WeaponC2S'
import { WeaponProgression } from './WeaponProgression'

/**
 * 洗点
 */
export class ActionWeaponCleanse extends GameAction {
    async doAction(req: ReqWeaponCleanse, res: ResWeaponCleanse) {
        const user = this.user

        const slotId = req.slotId
        const propId = req.propId
        const soul = WeaponProgression.getSoul(user, slotId)

        const costConf = C.weapon_soul_open(slotId)

        //消耗道具
        // if (costConf.costPropId > 0 && costConf.costNum > 0) {
        //     await Props.costProp(user, costConf.costPropId, costConf.costNum)
        // }

        const quality = await WeaponProgression.getQuality(user, propId, soul)

        let attrs: Map<int, AttrTypeBean>, specialFp: int
        // 阳舍利只洗特殊属性
        if (propId === ItemIdDefine.ITEM_ID_CLEANSE_POSTIVE) {
            ;[attrs, specialFp] = WeaponProgression.posPropSoul(quality, soul)
        } else {
            ;[attrs, specialFp] = WeaponProgression.makeSoul(quality)
        }

        soul.newBaseFp = PowerScoreRules.math_AttrFp(attrs)
        soul.newSpecialFp = specialFp
        soul.newQuality = quality
        soul.newAttrs.init(attrs)
    }
}
