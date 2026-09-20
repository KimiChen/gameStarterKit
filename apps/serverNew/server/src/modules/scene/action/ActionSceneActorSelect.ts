import { ReqSceneActorSelect } from '../SceneC2S'
import { ActionSceneLobby } from './ActionSceneLobby'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
/**
 * 选择目标
 */
export class ActionSceneActorSelect extends ActionSceneLobby {
    async doAction(req: ReqSceneActorSelect, res: ResDefault) {
        return
    }
}
