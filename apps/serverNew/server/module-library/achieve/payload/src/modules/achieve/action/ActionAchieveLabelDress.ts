import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { User } from '../../user/bean/User'
import { ReqAchieveLabelDress } from '../AchieveC2S'
import { AchieveErrors } from '../AchieveErrors'

/**
 * 点亮成就标签
 */
export class ActionAchieveLabelDress extends GameAction {
    async doAction(req: ReqAchieveLabelDress, res: ResDefault) {
        const labelId = req.cId
        const targetId = req.targetId
        if (labelId <= 0) {
            throw SystemErrors.SysParamError
        }
        const user = this.user
        if (targetId > 0 && !user.achieve.labels.has(targetId)) {
            throw AchieveErrors.AchieveNoLabel
        }

        const wearList = user.achieve.labelWears.copy()
        let targetPos = -1
        let delPos = -1
        const labConf = C.achievement_label(labelId)
        let total = labConf.value
        for (let i = 0; i < wearList.length; i++) {
            const id = wearList[0]
            if (id === labelId) {
                delPos = i
            } else if (targetId > 0 && id === targetId) {
                targetPos = i
            } else {
                total += C.achievement_label(id).value
            }
        }
        // 校验栏位是否足够
        if (getColNum(user) < total) {
            throw AchieveErrors.AchieveLabelColNoEnough
        }

        if (delPos > -1) {
            wearList.splice(delPos, 1)
        }

        if (targetPos > 0) {
            wearList[targetPos] = labelId
        } else {
            wearList.push(labelId)
        }

        const array = wearList as Array<int>

        user.achieve.labelWears.init(array)
        return
    }
}

function getColNum(user: User) {
    let total = 0
    const conf = C.achievement_label_open()
    conf.forEach((f) => {
        if (f.need > user.achieve.achievePoint) {
            total++
        }
    })
    return total
}
