import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ReqMissionSubscribe } from '../MissionC2S'
import { ActionMission } from './ActionMission'

/**
 * 订阅boss复活提醒
 */
export class ActionMissionSubscribe extends ActionMission {
    async doAction(req: ReqMissionSubscribe, res: ResDefault) {
        const mapId = req.bossId
        const type = req.type
        const isSubscribe = req.subscribe

        // 校验boss是否存在
        if (Param.KuiCowMap != mapId) {
            const mapConf = C.mission(type).more.get(mapId)
            if (!mapConf) {
                throw SystemErrors.SysNoConf
            }
        }

        const item = ActionMission.getMissionItem(this.user, type)
        if (isSubscribe) {
            // 添加不提醒订阅
            item.subscribes.set(mapId, mapId)
            item.subscribesHis.set(mapId, mapId)
        } else {
            // 删除不提醒订阅
            item.subscribes.delete(mapId)
        }
    }
}
