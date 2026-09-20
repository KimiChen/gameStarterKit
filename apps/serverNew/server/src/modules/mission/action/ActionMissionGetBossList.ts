import { PbMissionBossItem, ReqMissionGetBossList, ResMissionGetBossList } from '../MissionC2S'
import { ActionMission } from './ActionMission'

/**
 * 获取boss数量等详情信息
 */
export class ActionMissionGetBossList extends ActionMission {
    async doAction(req: ReqMissionGetBossList, res: ResMissionGetBossList) {
        let list: PbMissionBossItem[] = []
        if (req.type == ActionMission.TYPE_KUI_COW) {
            list = (await ActionMission.getKuiCowBoss(this.user)) ?? []
        } else {
            list = await ActionMission.getPersonnelBoss(this.user, req.type)
        }
        res.list = list
    }
}
