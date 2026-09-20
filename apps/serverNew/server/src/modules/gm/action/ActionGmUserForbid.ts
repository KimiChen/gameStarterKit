import { ReqGmUserForbid } from '../GmS2S'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { GameAction } from '../../../runtime/action/GameAction'
import { UserForbidType } from '../rules/UserForbidType'
import { User } from '../../user/bean/User'
import { timestamp } from '@arthropoda/game-engine'
import { UserForbidBean } from '../../user/bean/UserForbidBean'
import { ActionChat } from '../../chat/action/ActionChat'
import { ChatMessageKeys } from '../../chat/messaging/ChatMessageKeys'

export class ActionGmUserForbid extends GameAction {
    async doAction(req: ReqGmUserForbid, res: ResDefault) {
        if (!UserForbidType.TYPE_MAP[req.type]) {
            return
        }
        const user = await User.load(req.uId)
        if (!user) {
            return
        }
        if (req.forbid) {
            if (!ActionGmUserForbid.checkCanForbid(user, req.type)) {
                return
            }
            if (!user.refuse.has(req.type)) {
                const item = new UserForbidBean()
                item.id = req.type
                user.refuse.set(req.type, item)
            }
            user.refuse.get(req.type)!.endTime = req.time
            // 执行封禁操作
            await this.doForbid(user, req.type)
        } else {
            if (!ActionGmUserForbid.checkCanUnForbid(user, req.type)) {
                return
            }
            user.refuse.delete(req.type)
            // 执行解禁操作
            await this.doUnForbid(user, req.type)
        }
    }

    /**
     * 封禁需要操作
     * @param HUser $user
     * @param $type
     * @return void
     */
    private async doForbid(user: User, type: number) {
        if (type == UserForbidType.FORBID_CHAT) {
            // 清除玩家发言记录
            await ActionChat.removeUserChat(user.id, ActionChat.getRecordKey(ChatMessageKeys.CHAT_WORLD_KEY)) // 世界聊天
            user.guild &&
                (await ActionChat.removeUserChat(
                    user.id,
                    ActionChat.getRecordKey(ChatMessageKeys.CHAT_GUILD_KEY, user.guild),
                )) // 仙盟聊天

            // 活动跨服聊天删除
            for (const [k, v] of C.list()) {
                if (!v.crossType) {
                    continue
                }
                //TODO 旧代码未设计跨服功能
            }
        }
    }

    /**
     * 解禁需要操作
     * @param HUser $user
     * @param       $type
     */
    public async doUnForbid(user: User, type: int) {
        // 旧二进制推送已删除；原生 Lobby 领域推送待接入
        Log.info(`[${user.sId}区]解除封禁 uId=${user.id} type=${type}`)
    }

    /**
     * 判断是否可以封禁
     * @param HUser $user
     * @param int $type
     * @return bool
     */
    private static checkCanForbid(user: User, type: int): boolean {
        if (!user.refuse.has(type)) {
            return true
        }
        const refuseItem = user.refuse.get(type)
        if (refuseItem && refuseItem.endTime !== UserForbidType.FORBID_TIME && refuseItem.endTime <= timestamp()) {
            return true
        }
        return false
    }

    /**
     * 判断是否可以解禁
     * @param HUser $user
     * @param int $type
     * @return bool
     */
    private static checkCanUnForbid(user: User, type: int): boolean {
        return !this.checkCanForbid(user, type)
    }
}
