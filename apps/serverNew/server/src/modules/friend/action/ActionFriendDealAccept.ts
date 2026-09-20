import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { UserErrors } from '../../user/UserErrors'
import { User } from '../../user/bean/User'
import { FriendErrors } from '../FriendErrors'
import { ReqFriendDealAccept } from '../FriendS2S'
import { ActionFriend } from './ActionFriend'

/**
 * 接受好友请求
 */
export class ActionFriendDealAccept extends ActionFriend {
    async doAction(req: ReqFriendDealAccept, res: ResDefault) {
        const user = await User.load(req.uId)
        if (!user) {
            throw UserErrors.UserNoUser
        }
        const friend = await ActionFriend.load(user.id)
        if (friend == null) {
            throw SystemErrors.SysParamError
        }
        // 好友达到上限
        if (friend.list.size() >= ActionFriend.getFriendNum(user)) {
            throw FriendErrors.FriendTargetUpperLimit
        }
        // 被对方拉黑
        if (friend.black.has(req.friendId)) {
            throw FriendErrors.FriendHadTargetBlack
        }
        // 处理接受好友
        const friendUser = await User.loadOnlyRead(req.friendId)
        await ActionFriend.dealAccept(friend, user, friendUser!)
        // 自己的好友信息change
        await ActionFriend.setFriendNetInfo(friend.list.get(req.friendId)!, friend, friendUser)
    }
}
