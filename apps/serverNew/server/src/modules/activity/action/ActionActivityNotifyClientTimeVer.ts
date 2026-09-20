import { ReqActivityNotifyClientTimeVer } from '../ActivityS2S'
import { ResDefault } from '../../../runtime/protocol/S2S/default'
import { GameAction } from '../../../runtime/action/GameAction'

/**
 * 把新活动版本给全服在线玩家。
 *
 * 旧二进制通道（`Activity` Bean 变更推送）已随 P6 删除，本 S2S 动作暂无出口。
 * 原生 Lobby 侧的活动版本通知需按 shared 声明的领域推送，在 activity 模块的
 * NativeLobbyStore 内显式发送；保留本入口是为了 S2S 动作表不缺项。
 * ⛔ 不要在此处恢复框架级隐式推送。
 */
export class ActionActivityNotifyClientTimeVer extends GameAction {
    async doAction(req: ReqActivityNotifyClientTimeVer, res: ResDefault) {
        Log.info(`[${req.sId}区]活动版本变更，等待原生 Lobby 推送接入`)
    }
}
