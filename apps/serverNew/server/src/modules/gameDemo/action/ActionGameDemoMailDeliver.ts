import { millisecond } from '@arthropoda/game-engine'
import type { ReqGameDemoMailDeliver } from '../GameDemoS2S'
import { GameDemoMailbox } from '../rules/GameDemoMailbox'
import { ActionGameDemo } from './ActionGameDemo'

/** 可靠队列投递的奖励邮件，在收件人的玩家 Owner 上入箱；同一来源重复投递只入箱一次。 */
export class ActionGameDemoMailDeliver extends ActionGameDemo {
    async doAction(req: ReqGameDemoMailDeliver): Promise<void> {
        const player = await this.requirePlayer()
        GameDemoMailbox.deliver(player, req.source, req.title, req.gold, millisecond())
    }
}
