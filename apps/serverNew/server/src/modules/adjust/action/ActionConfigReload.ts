import { AdjustConfigLoader } from '../config/AdjustConfigLoader'
import { ReqConfigReload } from '../AdjustS2S'
import { ResDefault } from '../../../runtime/protocol/S2S/default'
import { GameAction } from '../../../runtime/action/GameAction'

/**
 * 重新加载配置
 */
export class ActionConfigReload extends GameAction {
    async doAction(req: ReqConfigReload, res: ResDefault) {
        await AdjustConfigLoader.loadAllTestConfig()
        Log.game.info('重新加载配置')
    }
}
