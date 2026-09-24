import type {
    IGameDemoMailbox,
    IGameDemoMailReadReq,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoMailbox } from '../rules/GameDemoMailbox'
import { ActionGameDemo } from './ActionGameDemo'

/** 标记已读天然幂等，按 natural-write 声明，不占用幂等闸。 */
export class ActionGameDemoMailRead extends ActionGameDemo {
    async doAction(req: IGameDemoMailReadReq, res: IGameDemoMailbox): Promise<void> {
        const player = await this.requirePlayer()
        GameDemoMailbox.markRead(player, req.mailId)
        res.mails = GameDemoMailbox.view(player).mails
    }
}
