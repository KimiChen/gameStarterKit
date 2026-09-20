import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ReqFriendBlackDel, ResFriendBlackDel } from '../FriendC2S'
import { ActionFriend } from './ActionFriend'

/**
 * 删除黑名单
 */
export class ActionFriendBlackDel extends ActionFriend {
    async doAction(req: ReqFriendBlackDel, res: ResFriendBlackDel) {
        const user = this.user
        const ids = req.ids

        if (ids.length == 0) {
            throw SystemErrors.SysParamError
        }

        const cache = await ActionFriend.load(user.id)
        if (!cache) {
            throw SystemErrors.SysParamError
        }

        for (const id of ids) {
            if (!cache.black.has(id)) {
                continue
            }
            // 剔除黑名单
            cache.black.delete(id)
        }
    }
}
