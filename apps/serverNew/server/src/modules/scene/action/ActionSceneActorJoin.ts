import { ReqSceneActorJoin } from '../SceneC2S'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ActionSceneLobby } from './ActionSceneLobby'

/**
 * 加入场景
 */
export class ActionSceneActorJoin extends ActionSceneLobby {
    async doAction(req: ReqSceneActorJoin, res: ResDefault) {
        return
    }
}
