import { GameAction } from '../../../runtime/action/GameAction'
import { ReqRepairScript } from '../GmS2S'
import { ResDefault } from '../../../runtime/protocol/S2S/default'
import { QueuedLocalAction } from '../../../runtime/action/QueuedLocalAction'
import { ActionActivityOpenReload } from '../../activity/action/ActionActivityOpenReload'
import { ActivityDefine } from '../../activity/rules/ActivityDefine'
import { User } from '../../user/bean/User'
import { ActivityRankUpdate } from '../../activity/rank/ActivityRankUpdate'
import { ServerStatusNotifier } from '../../serverSettings/notification/ServerStatusNotifier'
import { DB, timestamp } from '@arthropoda/game-engine'
import { ServerListModel } from '../../../../generated/persistence/ServerListModel'

export class ActionRepairScript extends GameAction {
    async doAction(req: ReqRepairScript, res: ResDefault) {
        const action = Reflect.get(ActionRepairScriptList, req.scriptName)
        if (!action) {
            Log.error('not found script name:' + req.scriptName)
            return
        }
        await action.doAction(req)
        return
    }
}

class Debug {
    static async doAction(req: ReqRepairScript) {
        timestamp()
        timestamp()
        timestamp()

        const user = (await User.load(10001078893))!
        await ActivityRankUpdate.run(user, [ActivityDefine.RankAbPointDraw], 999)
        await ServerStatusNotifier.pushModuleOff(1, [2, 3, 4])
        // for (const sId of req.serverIds) {
        // await QueueAction.rpc(ActionActivityOpenReload, { sIds: [Number(sId)] }, 0, 0)
        // }
    }
}

export const ActionRepairScriptList = {
    debug: Debug,
}
