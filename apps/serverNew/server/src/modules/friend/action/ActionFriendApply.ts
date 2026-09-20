import { getServerIdByUid, timestamp } from '@arthropoda/game-engine'
import { LocalAction } from '../../../runtime/action/LocalAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ReqFriendApply, ResFriendApply } from '../FriendC2S'
import { FriendErrors } from '../FriendErrors'
import { FriendItemBean } from '../bean/FriendItemBean'
import { ActionFriend } from './ActionFriend'
import { ActionFriendDealApply } from './ActionFriendDealApply'

/**
 * 好友申请
 */
export class ActionFriendApply extends ActionFriend {
    async doAction(req: ReqFriendApply, res: ResFriendApply) {
        const user = this.user
        const frId = req.id // 好友ID

        if (!frId) {
            throw SystemErrors.SysParamError
        }
        if (frId === user.id) {
            throw FriendErrors.FriendAddSelf
        }
        const selfItem = await ActionFriend.load(user.id)
        if (!selfItem) {
            throw SystemErrors.SysParamError
        }
        if (selfItem.black.has(frId)) {
            throw FriendErrors.FriendHadBlack
        }
        if (selfItem.list.has(frId)) {
            throw FriendErrors.FriendHad
        }
        //自己好友上限
        if (selfItem.list.size() >= ActionFriend.getFriendNum(user)) {
            throw FriendErrors.FriendUpperLimit
        }

        // 向对方申请好友
        const frSid = getServerIdByUid(frId)
        const result = await LocalAction.call(
            ActionFriendDealApply,
            {
                uId: frId,
                applyUserId: user.id,
            },
            frId,
            frSid,
        )
        if (!result.isSucc) {
            throw result.res
        }

        // 自己的申请记录
        selfItem.applyRecord.set(frId, new FriendItemBean({ id: frId, addTime: timestamp() }))
    }
}
