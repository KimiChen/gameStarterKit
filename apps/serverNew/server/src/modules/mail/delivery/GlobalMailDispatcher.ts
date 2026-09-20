import { timestamp, UserOnlineMgr } from '@arthropoda/game-engine'
import { LocalAction } from '../../../runtime/action/LocalAction'
import { QueuedLocalAction } from '../../../runtime/action/QueuedLocalAction'
import { ActionMailLoopSendGlobal } from '../action/ActionMailLoopSendGlobal'
import { ActionMailSendGlobal } from '../action/ActionMailSendGlobal'

export class GlobalMailDispatcher {
    static async init() {
        await QueuedLocalAction.rpc(ActionMailLoopSendGlobal, { sIds: [] }, 0, 0, timestamp() + 3)
    }

    static async broadcastSendGlobalMail(sIds: number[]) {
        for (const sId of sIds) {
            const onlineUsers = await UserOnlineMgr.getAll(sId)
            for (const userOnline of onlineUsers) {
                LocalAction.send(ActionMailSendGlobal, { uid: userOnline.uId }, userOnline.uId, 0)
            }
        }
    }
}
