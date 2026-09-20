import { ReqSceneInvitePageShield } from '../SceneC2S'
import { ActionSceneLobby } from './ActionSceneLobby'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
/**
 * 屏蔽||取消屏蔽邀请
 */
export class ActionSceneInvitePageShield extends ActionSceneLobby {
    async doAction(req: ReqSceneInvitePageShield, res: ResDefault) {
        return
    }
}
