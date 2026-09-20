import { ReqSceneActorGetRoomInfos, ResSceneActorGetRoomInfos } from '../SceneC2S'
import { ActionSceneLobby } from './ActionSceneLobby'

/**
 * 获取指定地图房间列表
 */
export class ActionSceneActorGetRoomInfos extends ActionSceneLobby {
    async doAction(req: ReqSceneActorGetRoomInfos, res: ResSceneActorGetRoomInfos) {
        return
    }
}
