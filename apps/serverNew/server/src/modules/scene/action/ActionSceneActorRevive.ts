import { ReqSceneActorRevive } from '../SceneC2S'
import { ActionSceneLobby } from './ActionSceneLobby'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
/**
 * 原地复活
 */
export class ActionSceneActorRevive extends ActionSceneLobby {
    async doAction(req: ReqSceneActorRevive, res: ResDefault) {
        return
    }
}
