import { ReqServerStop } from '../GmS2S'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { GameAction } from '../../../runtime/action/GameAction'

/**
 * GM 停服。
 *
 * 旧实现逐个 `MessageHelper.sendKickOutMsg` 写旧二进制踢人帧，该通道已随 P6 删除。
 * 「停服即断开全部客户端」现在由原生 Lobby 的停止路径承担：`LobbyServer.stop()` 会对每个
 * 连接发 1001 强制下线。因此这里不再需要逐用户踢人，也 ⛔ 不要在这里另起一套断连逻辑。
 */
export class ActionServerStop extends GameAction {
    async doAction(req: ReqServerStop, res: ResDefault) {
        Log.info(`GM 停服：区服 ${req.sIds.join(',')}，客户端断开由原生 Lobby 停止路径承担`)
    }
}
