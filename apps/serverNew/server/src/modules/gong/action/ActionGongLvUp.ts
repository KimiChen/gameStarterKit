import { GameAction } from '../../../runtime/action/GameAction'
import { Props } from '../../props/inventory/Props'
import { ReqGongLvUp, ResGongLvUp } from '../GongC2S'
import { GongErrors } from '../GongErrors'
import { GongProgression } from './GongProgression'

/**
 * 功法等级提升
 */
export class ActionGongLvUp extends GameAction {
    async doAction(req: ReqGongLvUp, res: ResGongLvUp) {
        const user = this.user
        const lvConf = C.gong(user.gong.lv)

        //是否满级
        const nextLvConf = C.gong(user.gong.lv + 1)
        if (nextLvConf == null) {
            throw GongErrors.GongMaxLv
        }

        //玩家等级限制
        if (user.lv + Param.GongLvLimit <= lvConf.showLv && lvConf.costPropId > 0) {
            throw GongErrors.GongNotEnoughLv
        }

        //消耗道具
        if (lvConf.costPropId > 0 && lvConf.costNum > 0) {
            await Props.costProp(user, lvConf.costPropId, lvConf.costNum)
        }

        //等级奖励
        if (lvConf.propId > 0 && lvConf.num > 0) {
            await Props.addProp(user, lvConf.propId, lvConf.num, res.awards)
        }

        //功法等级+1
        user.gong.lv++

        GongProgression.levelUp(user, user.gong.lv)

        res.lv = user.gong.lv
    }
}
