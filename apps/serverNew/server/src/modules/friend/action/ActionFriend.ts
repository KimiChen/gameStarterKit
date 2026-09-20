import { User } from '../../user/bean/User'
import { UserBaseRef } from '../../user/ref/UserBaseRef'
import { ReadonlyBean, timestamp } from '@arthropoda/game-engine'
import { GameAction } from '../../../runtime/action/GameAction'
import { UserProfileFormatter } from '../../user/action/UserProfileFormatter'
import { UserOnlineMgr } from '@arthropoda/game-engine'
import { getServerIdByUid } from '@arthropoda/game-engine'
import { Friend } from '../bean/Friend'
import { FriendItemBean } from '../bean/FriendItemBean'

export class ActionFriend extends GameAction {
    /** 好友关系 */
    static readonly STATUS_FRIEND = 1

    /** 已申请 */
    static readonly STATUS_APPLYED = 2

    /** 黑名单 */
    static readonly STATUS_BLACK = 3

    /**
     * 获取好友存储对象
     * @param userId
     * @param isNew
     * @returns
     */
    static async load(userId: int, isNew = true) {
        let friendBase = await Friend.load(userId)
        if (isNew && !friendBase) {
            friendBase = new Friend(userId)
        }
        return friendBase
    }

    /**
     * 判断是否为好友
     * @param uId
     * @param targetId
     * @returns
     */
    static async checkFriend(uId: int, targetId: int) {
        const friendBase = await Friend.load(uId)
        if (friendBase) {
            return friendBase.list.has(targetId)
        }
        return false
    }

    /**
     * 判断是否为黑名单
     * @param uId
     * @param targetId
     * @returns
     */
    static async checkBlack(uId: int, targetId: int) {
        const friendBase = await Friend.load(uId)
        if (friendBase) {
            return friendBase.black.has(targetId)
        }
        return false
    }

    /**
     * 添加最近的聊天记录
     * @param uId
     * @param targetId
     */
    static async addChatRecently(uId: int, targetId: int) {
        const toItem = await this.load(targetId)
        // 对方的最近聊天
        let toRecently = toItem!.recently.get(uId)
        if (!toRecently) {
            toRecently = new FriendItemBean({ id: uId })
            toItem!.recently.set(uId, toRecently)
        }
        toRecently.addTime = timestamp()

        const meItem = await this.load(uId)
        // 对方的最近聊天
        let meRecently = meItem!.recently.get(targetId)
        if (!meRecently) {
            meRecently = new FriendItemBean({ id: targetId })
            meItem!.recently.set(targetId, meRecently)
        }
        meRecently.addTime = timestamp()

        // 不是好友的时候，记录一些额外信息
        if (!meItem!.list.has(targetId)) {
            let num = toRecently.num
            if (toRecently.lastId == uId) {
                num++
            } else {
                num = 1
            }
            toRecently.num = num
            toRecently.lastId = uId

            meRecently.num = num
            meRecently.lastId = uId
        }
    }

    /**
     * 处理接受好友
     * @param selfCache
     * @param selfUser
     * @param friendUser 好友信息，仅查看不修改数据
     */
    static async dealAccept(selfCache: Friend, selfUser: User, friendUser: User | ReadonlyBean<User> | UserBaseRef) {
        const now = timestamp()
        const friendId = friendUser.id
        // 加入己方好友列表
        const selfNewFri = new FriendItemBean({
            id: friendId,
            addTime: now,
        })
        selfCache.list.set(friendId, selfNewFri)
        await this.setFriendNetInfo(selfNewFri, selfCache!, friendUser)

        // 删除申请记录
        selfCache.applyList.delete(friendId)
        selfCache.applyRecord.delete(friendId)
    }

    /**
     * 清除数据
     * @param userId
     */
    static async clear(userId: int) {
        const cache = await this.load(userId)
        cache!.recentlyTime = 0
    }

    /**
     * 与userId的好友关系
     * @param cache
     * @param userId
     * @returns
     */
    static async getStatus(cache: Friend, userId: int) {
        let status = 0
        if (cache.list.has(userId)) {
            status = this.STATUS_FRIEND // 好友关系
        } else if (cache.applyRecord.has(userId)) {
            status = this.STATUS_APPLYED // 已经发送申请
        } else if (cache.black.has(userId)) {
            status = this.STATUS_BLACK // 黑名单
        }
        return status
    }

    /**
     * 获取配置好友数量
     * @param user
     * @returns
     */
    static getFriendNum(user: User | ReadonlyBean<User> | UserBaseRef) {
        let realm = 1
        if (user instanceof UserBaseRef) {
            realm = user.realm
        } else {
            realm = user.realm
        }
        realm = Math.max(1, realm)
        return C.realm(realm).friendNum
    }

    /**
     * 检测申请是否过期
     * @param friendBase
     * @param uId
     */
    static async checkApplyExpire(friendBase: Friend, uId = 0) {
        const expireTime = timestamp() - Param.FriendApplyTime
        const removeFrId = []
        for (const [frId, item] of friendBase.applyList) {
            if (item.addTime < expireTime) {
                removeFrId.push(frId)
                if (uId > 0) {
                    // 对应的更新对方发起的apply记录
                    const tItem = await this.load(frId)
                    tItem!.applyRecord.delete(uId)
                }
            }
        }
        for (const id of removeFrId) {
            friendBase.applyList.delete(id)
        }
    }

    static async setModdoList(friend: Friend) {
        const frIds = friend.list.keys().concat(friend.black.keys())
        const infos = await UserBaseRef.loadAll(frIds)
        for (const [, item] of friend.list) {
            item.online = await UserOnlineMgr.isOnline(item.id, getServerIdByUid(item.id))
            const userInfo = infos.get(item.id)
            await this.setFriendNetInfo(item, friend, userInfo)
        }
    }

    static async setFriendNetInfo(
        item: FriendItemBean,
        friend: Friend,
        friendUser?: User | ReadonlyBean<User> | UserBaseRef,
    ) {
        if (friendUser) {
            let uId = 0
            let sId = 0
            if (friendUser instanceof UserBaseRef) {
                uId = friendUser.id
                sId = friendUser.sId
            } else {
                uId = friendUser.id
                sId = friendUser.sId
            }
            item.online = await UserOnlineMgr.isOnline(uId, sId)
            item.activityTime = friendUser instanceof UserBaseRef ? friendUser.activityTime : friendUser.activityTime
            item.userBaseInfo = UserProfileFormatter.format(friendUser)
        }
        item.chatTime = friend.recently.get(item.id)?.addTime ?? 0
    }
}
