import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { AdjustCmdChat } from '../../adjust/change/AdjustCmdChat'
import { UserErrors } from '../../user/UserErrors'
import { ReqChatSend, ResChatSend } from '../ChatC2S'
import { ChatErrors } from '../ChatErrors'
import { ActionChat } from './ActionChat'
import { ChatDefine } from '../rules/ChatDefine'

/**
 * 发送聊天
 */
export class ActionChatSend extends ActionChat {
    async doAction(req: ReqChatSend, res: ResChatSend) {
        const user = this.user

        if (await AdjustCmdChat.input(this.user, req.msg)) {
            return
        }

        // 检查禁言
        ActionChat.checkForbid(user)

        // 聊天消息为空判断
        if (req.msg.length == 0) {
            throw ChatErrors.ChatMsgIsNull
        }

        const emojiId = req.emojiId // 表情id 暂不支持，预留
        const msg = req.msg // 文本信息
        const chatType = req.chatType // 聊天类型
        let proId = req.proId // 聊天对象：chatType == 6 好友ID
        const msgType = ChatDefine.MSG_TYPE_GENERAL // 默认为普通文本消息
        const shareType = req.shareType
        const shareIds = req.shareIds

        const chatConf = ActionChat.CHAT_CONF[chatType] ?? null
        if (chatConf == null) {
            throw ChatErrors.ChatTypeErr
        }

        let atIds: number[] = []
        if (chatType != ChatDefine.CHAT_TYPE_FRIEND) {
            atIds = req.atIds
            ActionChat.checkAtIds(user.id, atIds)
        }

        // 可聊天等级限制
        let needLv = 0
        if (chatType == ChatDefine.CHAT_TYPE_FRIEND) {
            needLv = Param.ChatFriendTalkLevel
        } else if (chatType == ChatDefine.CHAT_TYPE_WORLD) {
            needLv = Param.ChatWorldTalkLevel
        }
        if (user.lv < needLv) {
            throw UserErrors.UserLvIsSmall
        }

        proId = ActionChat.getProId(user, chatType, proId)
        if (shareType > 0) {
            if (shareIds.length == 0) {
                throw SystemErrors.SysParamError
            }
            // 聊天分享
            await ActionChat.chatShare(user, shareType, chatType, shareIds, proId, msg, atIds)
        } else {
            // 发送聊天信息
            await ActionChat.sendChat(user, chatType, msg, emojiId, msgType, proId, atIds)
        }
    }
}
