import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ReqFriendChatDel, ResFriendChatDel } from '../FriendC2S'
import { ActionFriend } from './ActionFriend'

/**
 * 删除与好友的聊天
 */
export class ActionFriendChatDel extends ActionFriend {
    async doAction(req: ReqFriendChatDel, res: ResFriendChatDel) {
        const user = this.user
        const id = req.id

        if (!id) {
            throw SystemErrors.SysParamError
        }

        const cache = await ActionFriend.load(user.id)
        if (!cache || cache.recently.has(id)) {
            return
        }
        // 删除最近聊天
        cache.recently.delete(id)
    }
}
