import { LocalAction } from '../../../runtime/action/LocalAction'
import { ReqConfigReloadBroadcast } from '../AdjustS2S'
import { ResDefault } from '../../../runtime/protocol/S2S/default'
import { GameAction } from '../../../runtime/action/GameAction'
import { ActionConfigReload } from './ActionConfigReload'

/**
 * 重新加载配置
 */
export class ActionConfigReloadBroadcast extends GameAction {
    async doAction(req: ReqConfigReloadBroadcast, res: ResDefault) {
        LocalAction.broadcast(ActionConfigReload, {})
    }
}
