import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { UserErrors } from '../../user/UserErrors'
import { User } from '../../user/bean/User'
import { ReqFriendDefriend } from '../FriendS2S'
import { ActionFriend } from './ActionFriend'

/**
 * 解除好友关系
 */
export class ActionFriendDefriend extends ActionFriend {
    async doAction(req: ReqFriendDefriend, res: ResDefault) {
        const user = await User.load(req.uId)
        if (!user) {
            throw UserErrors.UserNoUser
        }
        // 删除对方好友
        const friend = await ActionFriend.load(user.id)
        if (!friend) {
            throw UserErrors.UserNoUser
        }
        friend.list.delete(req.friendId)
        friend.applyList.delete(req.friendId)
        friend.applyRecord.delete(req.friendId)
    }
}
