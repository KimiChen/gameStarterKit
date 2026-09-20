import { timestamp } from '@arthropoda/game-engine'
import { FeatureAccess } from '../../../modules/user/access/FeatureAccess'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { UserErrors } from '../../user/UserErrors'
import { ModuleOpenType } from '../../user/access/ModuleOpenType'
import { User } from '../../user/bean/User'
import { FriendErrors } from '../FriendErrors'
import { ReqFriendDealApply } from '../FriendS2S'
import { FriendItemBean } from '../bean/FriendItemBean'
import { ActionFriend } from './ActionFriend'

/**
 * 处理好友申请
 */
export class ActionFriendDealApply extends ActionFriend {
    async doAction(req: ReqFriendDealApply, res: ResDefault) {
        const user = await User.load(req.uId)
        if (!user) {
            throw UserErrors.UserNoUser
        }
        // 功能模块检测
        if (!FeatureAccess.check(user, ModuleOpenType.SYS_FRIEND)) {
            throw FriendErrors.FriendTargetModuleOff
        }
        const friend = await ActionFriend.load(user.id)
        if (!friend) {
            throw SystemErrors.SysParamError
        }
        // 存在的黑名单中
        if (friend.black.has(req.applyUserId)) {
            throw FriendErrors.FriendHadTargetBlack
        }
        // 好友上限
        if (friend.list.size() >= ActionFriend.getFriendNum(user)) {
            throw FriendErrors.FriendUpperLimit
        }
        // 是否已申请
        if (friend.applyList.has(req.applyUserId)) {
            throw FriendErrors.FriendHadApply
        }
        // 好友申请是否已超上限
        await ActionFriend.checkApplyExpire(friend, req.applyUserId)
        if (friend.applyList.size() >= Param.FriendApplyMaxLimit) {
            throw FriendErrors.FriendApplyLimit
        }
        // 申请列表
        friend.applyList.set(req.applyUserId, new FriendItemBean({ id: req.applyUserId, addTime: timestamp() }))
    }
}
