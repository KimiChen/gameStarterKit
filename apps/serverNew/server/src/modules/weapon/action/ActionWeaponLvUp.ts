import { GameAction } from '../../../runtime/action/GameAction'
import { ReqWeaponLvUp, ResWeaponLvUp } from '../WeaponC2S'
import { WeaponErrors } from '../WeaponErrors'
import { WeaponProgression } from './WeaponProgression'

/**
 * 法宝等级提升
 */
export class ActionWeaponLvUp extends GameAction {
    async doAction(req: ReqWeaponLvUp, res: ResWeaponLvUp) {
        const user = this.user

        // 已满级
        if (C.weapon(user.weapon.lv + 1) == null) {
            throw WeaponErrors.WeaponMaxLv
        }

        const lvConf = C.weapon(user.weapon.lv)

        // 玩家等级限制
        // if (user.info.lv + Param.WeaponLvLimit <= lvConf.showLv && lvConf.costPropId > 0) {
        // throw GongErrors.GongNotEnoughLv
        // }

        // 消耗道具
        // if (lvConf.costPropId > 0 && lvConf.costNum > 0) {
        // await Props.costProp(user, lvConf.costPropId, lvConf.costNum)
        // }

        // 等级 + 1
        user.weapon.lv++

        // 器灵解锁
        WeaponProgression.openSoul(user)

        // 法宝升级事件
        await WeaponProgression.levelUp(user, user.weapon.lv)
    }
}
