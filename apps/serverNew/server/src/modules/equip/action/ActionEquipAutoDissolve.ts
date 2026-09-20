import { ReqEquipAutoDissolve, ResEquipAutoDissolve } from '../EquipC2S'
import { EquipDissolveBean } from '../bean/EquipDissolveBean'
import { GameAction } from '../../../runtime/action/GameAction'

/**
 * 装备溶解设置
 */
export class ActionEquipAutoDissolve extends GameAction {
    async doAction(req: ReqEquipAutoDissolve, res: ResEquipAutoDissolve) {
        const user = this.user
        // 评分比较是否开启
        user.equip.isOpenFpDissolve = req.isOpenFpDissolve

        for (const item of req.dissolveSets) {
            const quality = item.quality
            const level = item.level
            const enable = item.enable

            let autoSet = user.equip.equipAutoDissolve.get(quality)
            if (autoSet == null) {
                autoSet = new EquipDissolveBean({ quality: quality })
                user.equip.equipAutoDissolve.set(quality, autoSet)
            }
            autoSet.enable = enable
            autoSet.level = level
        }
    }
}
