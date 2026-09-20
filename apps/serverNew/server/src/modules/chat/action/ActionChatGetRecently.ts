import { UserBaseRef } from '../../user/ref/UserBaseRef'
import { timestamp } from '@arthropoda/game-engine'
import { ActionFriend } from '../../friend/action/ActionFriend'
import { ActionChat } from './ActionChat'
import { ChatRecord } from '../persistence/ChatRecord'
import { ReqChatGetRecently, ResChatGetRecently } from '../ChatC2S'
import { UserProfileFormatter } from '../../user/action/UserProfileFormatter'

/**
 * 最近的私聊好友与陌生人私聊
 */
export class ActionChatGetRecently extends ActionChat {
    async doAction(req: ReqChatGetRecently, res: ResChatGetRecently) {
        const user = this.user
        const friendItem = await ActionFriend.load(user.id)
        if (!friendItem) {
            return
        }
        const fIds = friendItem.recently.keys()

        const friendUsers = await UserBaseRef.loadAll(fIds)
        const now = timestamp()

        const delIds = []
        for (const [fId, item] of friendItem.recently) {
            if (now - item.addTime > Param.ChatDay) {
                delIds.push(fId)
                // RedDotList.clearRedDot(user, RedDotList.TYPE_FRIEND_CHAT, fId)
                continue
            }
            const key = ActionChat.getFriendRecordKey(fId, user.id)
            const record = ChatRecord.load(key)
            const chats = await record.first()

            const friendUser = friendUsers.get(fId)

            const isFriend = friendItem.list.has(fId)
            if (friendUser && chats.length > 0) {
                res.list.push({
                    msg: chats[0],
                    isFriend: isFriend,
                    msgNum: item.num,
                    friendInfo: UserProfileFormatter.format(friendUser).toModData() as any,
                })
            }
            if (chats.length == 0) {
                // RedDotList.clearRedDot(user, RedDotList.TYPE_FRIEND_CHAT, fId)
            }
        }

        // 做个兼容，删除不在keys里面的红点数据
        // RedDotList.clearNotInKeysRedDot(user, RedDotList.TYPE_FRIEND_CHAT, friendItem.recently.keys())
    }
}
