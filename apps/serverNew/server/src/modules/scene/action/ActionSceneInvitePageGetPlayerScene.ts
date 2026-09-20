import { ReqSceneInvitePageGetPlayerScene, ResSceneInvitePageGetPlayerScene } from '../SceneC2S'
import { ActionSceneLobby } from './ActionSceneLobby'

/**
 * 获取玩家当前场景位置
 */
export class ActionSceneInvitePageGetPlayerScene extends ActionSceneLobby {
    async doAction(req: ReqSceneInvitePageGetPlayerScene, res: ResSceneInvitePageGetPlayerScene) {
        return
    }
}
