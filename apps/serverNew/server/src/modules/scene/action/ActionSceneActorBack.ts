import { ReqSceneActorBack } from '../SceneC2S'
import { ActionSceneLobby } from './ActionSceneLobby'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
/**
 * 玩家返回场景(同步玩家数据)
 */
export class ActionSceneActorBack extends ActionSceneLobby {
    async doAction(req: ReqSceneActorBack, res: ResDefault) {
        return
    }
}
