import { ReqMissionGetList, ResMissionGetList } from '../MissionC2S'
import { ActionMission } from './ActionMission'

/**
 * 获取历练首页信息
 */
export class ActionMissionGetList extends ActionMission {
    async doAction(req: ReqMissionGetList, res: ResMissionGetList) {
        res.list = []

        // 组装个人历练相关信息
        for (const [, config] of C.mission()) {
            const bossList = await ActionMission.getPersonnelBoss(this.user, config.id)
            res.list.push({
                type: config.id,
                bossList: bossList,
            })
        }

        // 组装本服夔牛相关信息
        const kuiCowBoss = await ActionMission.getKuiCowBoss(this.user)
        if (kuiCowBoss) {
            res.list.push({
                type: Param.KuiCowType,
                bossList: kuiCowBoss,
            })
        }
    }
}
