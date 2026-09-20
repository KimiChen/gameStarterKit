import { ActionEventArgs, ActionEventHandlerBase } from '@arthropoda/game-engine'
import { RankAccess } from '../persistence/RankAccess'
import { RankDefine } from '../rules/RankDefine'

export class RankUserEnterHandler extends ActionEventHandlerBase {
    async handler(data: ActionEventArgs) {
        console.log(`exec EnterHandler event : ${data.ctx.apiName}`)

        const user = Ctx.user
        if (user.fp > 0) {
            await RankAccess.getRedisRank(RankDefine.TYPE_FP, user.sId).set(user.id, user.fp)
        }
    }
}
