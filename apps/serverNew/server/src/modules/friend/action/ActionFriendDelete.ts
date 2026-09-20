import { getServerIdByUid } from '@arthropoda/game-engine'
import { LocalAction } from '../../../runtime/action/LocalAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ReqFriendDelete, ResFriendDelete } from '../FriendC2S'
import { FriendErrors } from '../FriendErrors'
import { ActionFriend } from './ActionFriend'
import { ActionFriendDefriend } from './ActionFriendDefriend'

/**
 * 删除好友
 */
export class ActionFriendDelete extends ActionFriend {
    async doAction(req: ReqFriendDelete, res: ResFriendDelete) {
        const user = this.user
        const frId = req.id

        if (!frId) {
            throw SystemErrors.SysParamError
        }
        const cache = await ActionFriend.load(user.id)
        if (!cache || !cache.list.has(frId)) {
            throw FriendErrors.FriendNot
        }

        // 删除己方好友列表
        cache.list.delete(frId)

        // 删除对方好友列表
        LocalAction.send(ActionFriendDefriend, { uId: frId, friendId: user.id }, frId, getServerIdByUid(frId))
    }
}
