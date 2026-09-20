import { UtilObject } from '@arthropoda/game-engine'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { Props } from '../../props/inventory/Props'
import { ReqMissionBuyNum } from '../MissionC2S'
import { MissionErrors } from '../MissionErrors'
import { ActionMission } from './ActionMission'

/**
 * 购买挑战次数
 */
export class ActionMissionBuyNum extends ActionMission {
    async doAction(req: ReqMissionBuyNum, res: ResDefault) {
        const type = req.type
        const costType = req.costType

        const conf = C.mission_buy(type)
        const item = ActionMission.getMissionItem(this.user, type, true)
        if (item.buyNum >= conf.times) {
            // 判断是否超过购买上限
            throw MissionErrors.MissionOverBuyNum
        }

        // 获取购买消耗配置
        let costConf = null
        const buyNum = item.buyNum + 1
        for (const [, timesConf] of conf.more) {
            if (timesConf.times > buyNum) {
                break
            }
            costConf = timesConf
        }
        if (costConf == null) {
            // 找不到购买配置
            throw SystemErrors.SysNoConf
        }

        const propId = UtilObject.getValue(costConf, `costPropId${costType}`)
        const costNum = UtilObject.getValue(costConf, `costNum${costType}`)
        if (propId == null || costNum == null) {
            // 找不到购买配置
            throw SystemErrors.SysNoConf
        }

        item.buyNum++
        await Props.costProp(this.user, propId, costNum)

        // const times = ActionMission.getChallengeAbleTimes(this.user, type)
        // SceneSync.syncServer(
        //     this.uId,
        //     SceneSyncManager.SYNC_TYPE_SCENE_PARAMS,
        //     [SceneMission.PARAM_FIELD_TIMES => times]
        // )
    }
}
