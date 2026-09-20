import { ReqChatGetList, ResChatGetList } from '../ChatC2S'
import { ChatErrors } from '../ChatErrors'
import { ActionChat } from './ActionChat'
import { ChatDefine } from '../rules/ChatDefine'

/**
 * 获取聊天消息列表
 */
export class ActionChatGetList extends ActionChat {
    async doAction(req: ReqChatGetList, res: ResChatGetList) {
        const user = this.user
        const chatType = req.chatType
        const proId = ActionChat.getProId(user, chatType, req.proId)

        const chatConf = ActionChat.CHAT_CONF[chatType] ?? null
        if (chatConf == null) {
            throw ChatErrors.ChatTypeErr
        }

        const uId = chatType == ChatDefine.CHAT_TYPE_FRIEND ? user.id : 0
        const chatRecordKey = ActionChat.getRecordKey(chatConf.cacheKey, proId, uId)

        res.msgs = await ActionChat.getChatList(req.time, chatRecordKey)
    }
}
