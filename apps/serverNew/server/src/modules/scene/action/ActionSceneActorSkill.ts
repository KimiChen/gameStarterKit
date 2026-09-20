import { ReqSceneActorSkill } from '../SceneC2S'
import { ActionSceneLobby } from './ActionSceneLobby'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
/**
 * 使用技能
 */
export class ActionSceneActorSkill extends ActionSceneLobby {
    async doAction(req: ReqSceneActorSkill, res: ResDefault) {
        return
    }
}
