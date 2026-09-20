import { ReqChangeServerState } from '../GmS2S'
import { ResDefault } from '../../../runtime/protocol/S2S/default'
import { GameAction } from '../../../runtime/action/GameAction'
import { ServerSettingRefresh } from '../../serverSettings/runtime/ServerSettingRefresh'

export class ActionChangeServerState extends GameAction {
    async doAction(req: ReqChangeServerState, res: ResDefault) {
        await ServerSettingRefresh.refreshAllServerCache(req.sIds)
    }
}
