import { getServerIdByUid, timestamp } from '@arthropoda/game-engine'
import { LocalAction } from '../../../runtime/action/LocalAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { UserErrors } from '../../user/UserErrors'
import { User } from '../../user/bean/User'
import { ReqFriendBlackAdd, ResFriendBlackAdd } from '../FriendC2S'
import { FriendErrors } from '../FriendErrors'
import { FriendItemBean } from '../bean/FriendItemBean'
import { ActionFriend } from './ActionFriend'
import { ActionFriendDefriend } from './ActionFriendDefriend'

/**
 * 加入黑名单
 *
 * 旧二进制通道（`friend/PushFriendUpdate`）已随 P6 删除；被拉黑一方的通知需按
 * shared 声明的领域推送，在 friend 模块的 NativeLobbyStore 内显式发送。
 * ⛔ 不要在此处恢复框架级隐式推送。
 */
export class ActionFriendBlackAdd extends ActionFriend {
    async doAction(req: ReqFriendBlackAdd, res: ResFriendBlackAdd) {
        const user = this.user
        const frId = req.id

        if (!frId || frId === user.id) {
            throw SystemErrors.SysParamError
        }
        const friendUser = await User.load(frId)
        if (!friendUser) {
            throw UserErrors.UserNoUser
        }

        const cache = await ActionFriend.load(user.id)
        if (!cache) {
            throw SystemErrors.SysParamError
        }
        if (cache.black.has(frId)) {
            throw FriendErrors.FriendHadBlack
        }
        // 黑名单人数达到上限
        if (cache.black.size() >= Param.FriendBlackList) {
            throw FriendErrors.FriendBlackLimit
        }
        cache.black.set(frId, new FriendItemBean({ id: frId, addTime: timestamp() }))

        // 删除己方好友
        cache.list.delete(frId)
        cache.applyRecord.delete(frId)
        cache.applyList.delete(frId)

        // 删除对方好友
        await LocalAction.call(ActionFriendDefriend, { uId: frId, friendId: user.id }, frId, getServerIdByUid(frId))

        // 自己的黑名单信息change
        await ActionFriend.setFriendNetInfo(cache.black.get(frId)!, cache, friendUser)
    }
}
