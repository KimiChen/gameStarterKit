import { UserOnlineMgr } from '@arthropoda/game-engine'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { UserProfileFormatter } from '../../user/action/UserProfileFormatter'
import { UserBaseRef } from '../../user/ref/UserBaseRef'
import { FriendInfo, ReqFriendApplyList, ResFriendApplyList } from '../FriendC2S'
import { ActionFriend } from './ActionFriend'

/**
 * 好友申请列表
 */
export class ActionFriendApplyList extends ActionFriend {
    async doAction(req: ReqFriendApplyList, res: ResFriendApplyList) {
        const user = this.user

        const friendItem = await ActionFriend.load(user.id)
        if (!friendItem) {
            throw SystemErrors.SysParamError
        }

        // 无申请列表
        if (friendItem.applyList.size() == 0) {
            return
        }

        // 检查自己的申请是否有过期
        await ActionFriend.checkApplyExpire(friendItem, user.id)

        const friends: FriendInfo[] = []

        const frIds = friendItem.applyList.keys()
        const infos = await UserBaseRef.loadAll(frIds)
        for (const [, item] of friendItem.applyList) {
            const friendUser = infos.get(item.id)
            if (!friendUser) continue
            friends.push({
                uInfo: UserProfileFormatter.format(friendUser).toModData() as any,
                online: await UserOnlineMgr.isOnline(friendUser.id, friendUser.sId),
                time: item.addTime,
                status: 2,
            })
        }

        res.list = friends
    }
}
