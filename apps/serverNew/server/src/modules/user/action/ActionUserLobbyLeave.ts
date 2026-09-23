import { ApiCall, UserOnlineMgr } from '@arthropoda/game-engine'
import { GameAction } from '../../../runtime/action/GameAction'
import { UserSessionLifecycle } from '../lifecycle/UserSessionLifecycle'

/** 离线写入也必须运行在玩家 Owner 的串行 Action 和 Bean 保存上下文中。 */
export class ActionUserLobbyLeave extends GameAction {
    private leaveUid = 0
    private leaveSid = 0

    async actionBefore(call: ApiCall<any, any, any>): Promise<void> {
        this.leaveUid = call.uId
        this.leaveSid = call.messageHead.serverId ?? SERVER_ID
        await super.actionBefore(call)
    }

    async doAction(): Promise<void> {
        if (this.user) await UserSessionLifecycle.leave(this.user)
        else await UserOnlineMgr.del(this.leaveUid, this.leaveSid)
    }
}
