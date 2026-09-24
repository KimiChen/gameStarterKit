import type {
    IGameDemoMailClaim,
    IGameDemoMailClaimReq,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoInventory } from '../rules/GameDemoInventory'
import { GameDemoMailbox } from '../rules/GameDemoMailbox'
import { ActionGameDemo } from './ActionGameDemo'

/** 领取附件：金币记入宿主 User.copper，与邮件状态在同一次 Bean 提交里完成。 */
export class ActionGameDemoMailClaim extends ActionGameDemo {
    async doAction(req: IGameDemoMailClaimReq, res: IGameDemoMailClaim): Promise<void> {
        const user = this.requireUser()
        const player = await this.requirePlayer()
        GameDemoMailbox.claim(user, player, req.mailId)
        res.assets = GameDemoInventory.assets(user, player)
        res.mailbox = GameDemoMailbox.view(player)
    }
}
