import { getServerIdByUid } from '@arthropoda/game-engine'
import { LocalAction } from '../../../runtime/action/LocalAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { User } from '../../user/bean/User'
import { ReqFriendAccept, ResFriendAccept } from '../FriendC2S'
import { FriendErrors } from '../FriendErrors'
import { ActionFriend } from './ActionFriend'
import { ActionFriendDealAccept } from './ActionFriendDealAccept'

/**
 * 接受申请
 */
export class ActionFriendAccept extends ActionFriend {
    async doAction(req: ReqFriendAccept, res: ResFriendAccept) {
        const user = this.user
        const frId = req.id

        if (frId == 0) {
            throw SystemErrors.SysParamError
        }

        const friend = await ActionFriend.load(user.id)
        if (friend == null) {
            throw SystemErrors.SysParamError
        }

        // 好友申请不存在
        if (!friend.applyList.has(frId)) {
            throw FriendErrors.FriendNotApply
        }
        // 已成为好友,不报错,删除申请
        if (friend.list.has(frId)) {
            friend.applyList.delete(frId)
            return
        }
        // 好友达到上限
        if (friend.list.size() >= ActionFriend.getFriendNum(user)) {
            throw FriendErrors.FriendUpperLimit
        }
        // 对方在黑名单中
        if (friend.black.has(frId)) {
            throw FriendErrors.FriendHadBlack
        }

        // 对方先添加好友
        const rs = await LocalAction.call(
            ActionFriendDealAccept,
            { uId: frId, friendId: user.id },
            frId,
            getServerIdByUid(frId),
        )
        if (!rs.isSucc) {
            throw rs.res
        }

        // 处理接受好友
        const friendUser = await User.loadOnlyRead(frId)
        await ActionFriend.dealAccept(friend, user, friendUser!)

        // 任务埋点
        // 红点更新
        // 数数埋点
    }
}
