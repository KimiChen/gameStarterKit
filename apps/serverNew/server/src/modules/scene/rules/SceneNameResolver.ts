import { MissionConfigIndex } from '../../mission/config/MissionConfigIndex'
import { ActionPractice } from '../../practice/action/ActionPractice'
import { ModuleOpenType } from '../../user/access/ModuleOpenType'
import { User } from '../../user/bean/User'

export class SceneNameResolver {
    static getSceneName(sysId: int, cId = 0): string {
        switch (sysId) {
            case ModuleOpenType.SYS_PRACTICE:
                return cId ? C.practice(cId).name : C.system_id(sysId).name
            case ModuleOpenType.SYS_PRACTICEMULTI:
                return C.practice_multi(cId).name
            case ModuleOpenType.SYS_MISSION:
                return C.mission(MissionConfigIndex.missionMapIdToType[cId]).name
            case ModuleOpenType.SYS_HEART_DEMON:
                return C.heart_demon(ActionPractice.getChapterIdOfSort(cId)).name
            default:
                return C.system_id().has(sysId) ? C.system_id(sysId).name : '未知系统'
        }
    }

    static getBossName(user: User, sysId: int, cId: int = 0): string {
        switch (sysId) {
            case ModuleOpenType.SYS_PRACTICE:
                if (cId) {
                    const turnId = user.practice.practiceInfo.get(user.practice.practiceId)!.turnId
                    const bossId = C.practice(cId).more.get(turnId).bossId
                    return C.monster(bossId).name
                }
                return C.system_id(sysId).name
            case ModuleOpenType.SYS_PRACTICEMULTI:
                return C.practice_multi(cId).name
            case ModuleOpenType.SYS_MISSION: {
                const monsterId = C.mission(MissionConfigIndex.missionMapIdToType[cId]).more.get(cId).monsterId
                return C.monster(monsterId).name
            }
            case ModuleOpenType.SYS_HEART_DEMON:
                return C.heart_demon(ActionPractice.getChapterIdOfSort(cId)).name
            default:
                return C.system_id().has(sysId) ? C.system_id(sysId).name : '未知系统'
        }
    }
}
