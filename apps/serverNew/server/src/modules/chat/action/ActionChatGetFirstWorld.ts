import { ChatDefine } from '../rules/ChatDefine'
import { ReqChatGetFirstWorld, ResChatGetFirstWorld } from '../ChatC2S'
import { ActionChat } from './ActionChat'
import { ChatRecord } from '../persistence/ChatRecord'

/**
 * 获取一条世界消息
 */
export class ActionChatGetFirstWorld extends ActionChat {
    async doAction(req: ReqChatGetFirstWorld, res: ResChatGetFirstWorld) {
        const chatConf = ActionChat.CHAT_CONF[ChatDefine.CHAT_TYPE_WORLD]
        const chatRecord = ChatRecord.load(chatConf.cacheKey)
        res.msgs = await chatRecord.first()
    }
}
