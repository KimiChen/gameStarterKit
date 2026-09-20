import { getServerIdByUid } from '@arthropoda/game-engine'
import { LocalAction } from '../../../runtime/action/LocalAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ReqFriendBatchReject, ResFriendBatchReject } from '../FriendC2S'
import { ActionFriend } from './ActionFriend'
import { ActionFriendDealReject } from './ActionFriendDealReject'

/**
 * 一键拒绝
 */
export class ActionFriendBatchReject extends ActionFriend {
    async doAction(req: ReqFriendBatchReject, res: ResFriendBatchReject) {
        const user = this.user

        const cache = await ActionFriend.load(user.id)
        if (!cache) {
            throw SystemErrors.SysParamError
        }

        if (cache.applyList.size() === 0) {
            return
        }

        for (const [, apply] of cache.applyList) {
            LocalAction.send(
                ActionFriendDealReject,
                { uId: apply.id, friendId: user.id },
                apply.id,
                getServerIdByUid(apply.id),
            )
        }

        for (const [, apply] of cache.applyList) {
            LocalAction.send(
                ActionFriendDealReject,
                { uId: apply.id, friendId: user.id },
                apply.id,
                getServerIdByUid(apply.id),
            )
        }

        // 删除申请列表
        cache.applyList.clear()
    }
}
