import { getServerIdByUid } from '@arthropoda/game-engine'
import { LocalAction } from '../../../runtime/action/LocalAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ReqFriendReject, ResFriendReject } from '../FriendC2S'
import { ActionFriend } from './ActionFriend'
import { ActionFriendDefriend } from './ActionFriendDefriend'

/**
 * 拒绝好友申请
 */
export class ActionFriendReject extends ActionFriend {
    async doAction(req: ReqFriendReject, res: ResFriendReject) {
        const user = this.user
        const id = req.id
        if (!id) {
            throw SystemErrors.SysParamError
        }

        const cache = await ActionFriend.load(user.id)
        if (!cache || !cache.applyList.has(id)) {
            return
        }
        cache.applyList.delete(id)

        // 删除申请记录
        LocalAction.send(ActionFriendDefriend, { uId: id, friendId: user.id }, id, getServerIdByUid(id))
    }
}
