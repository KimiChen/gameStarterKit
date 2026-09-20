import { ReqSceneActorLeave } from '../SceneC2S'
import { ActionSceneLobby } from './ActionSceneLobby'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
/**
 * 离开场景
 */
export class ActionSceneActorLeave extends ActionSceneLobby {
    async doAction(req: ReqSceneActorLeave, res: ResDefault) {
        return
    }
}
