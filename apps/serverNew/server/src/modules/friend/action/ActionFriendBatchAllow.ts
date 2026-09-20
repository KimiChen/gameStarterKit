import { getServerIdByUid } from '@arthropoda/game-engine'
import { LocalAction } from '../../../runtime/action/LocalAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { UserBaseRef } from '../../user/ref/UserBaseRef'
import { ReqFriendBatchAllow, ResFriendBatchAllow } from '../FriendC2S'
import { FriendErrors } from '../FriendErrors'
import { ActionFriend } from './ActionFriend'
import { ActionFriendDealAccept } from './ActionFriendDealAccept'

/**
 * 一键同意
 */
export class ActionFriendBatchAllow extends ActionFriend {
    async doAction(req: ReqFriendBatchAllow, res: ResFriendBatchAllow) {
        const user = this.user

        const cache = await ActionFriend.load(user.id)
        if (!cache) {
            throw SystemErrors.SysParamError
        }
        if (cache.applyList.size() == 0) {
            return
        }

        const applyFriendIds = cache.applyList.keys()
        const limit = ActionFriend.getFriendNum(user) - cache.list.size()
        if (limit < 1) {
            throw FriendErrors.FriendUpperLimit
        }

        let num = 0
        const friendUsers = await UserBaseRef.loadAll(applyFriendIds)

        // 优先同意先发出好友申请的玩家
        for (const [frId, item] of cache.applyList) {
            // 达到好友上限
            if (num >= limit) {
                break
            }
            if (cache.list.has(frId) || cache.black.has(frId)) {
                cache.applyList.delete(frId)
                continue
            }
            const friendUser = friendUsers.get(frId) ?? null
            if (!friendUser) {
                continue
            }
            // 对方先添加好友 TODO:
            const rs = await LocalAction.call(
                ActionFriendDealAccept,
                { uId: frId, friendId: user.id },
                frId,
                getServerIdByUid(frId),
            )

            if (!rs.isSucc) {
                continue
            }
            // 添加好友,自动生成双方change
            await ActionFriend.dealAccept(cache, user, friendUser)
            num++
        }

        // 优先同意先发出好友申请的玩家
        for (const [frId, item] of cache.applyList) {
            // 达到好友上限
            if (num >= limit) {
                break
            }
            if (cache.list.has(frId) || cache.black.has(frId)) {
                cache.applyList.delete(frId)
                continue
            }
            const friendUser = friendUsers.get(frId) ?? null
            if (!friendUser) {
                continue
            }
            // 对方先添加好友
            const rs = await LocalAction.call(
                ActionFriendDealAccept,
                { uId: frId, friendId: user.id },
                frId,
                getServerIdByUid(frId),
            )
            if (!rs.isSucc) {
                continue
            }
            // 添加好友,自动生成双方change
            await ActionFriend.dealAccept(cache, user, friendUser)
            num++

            // 自己的好友信息change
            await ActionFriend.setFriendNetInfo(item, cache, friendUser)
        }
    }
}
