import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { UserErrors } from '../../user/UserErrors'
import { User } from '../../user/bean/User'
import { ReqFriendDealReject } from '../FriendS2S'
import { ActionFriend } from './ActionFriend'

/**
 * 被拒绝好友申请
 */
export class ActionFriendDealReject extends ActionFriend {
    async doAction(req: ReqFriendDealReject, res: ResDefault) {
        const user = await User.load(req.uId)
        if (!user) {
            throw UserErrors.UserNoUser
        }
        const friend = await ActionFriend.load(user.id, false)
        if (!friend) {
            return
        }
        // 删除申请记录
        friend.applyRecord.delete(user.id)
    }
}
