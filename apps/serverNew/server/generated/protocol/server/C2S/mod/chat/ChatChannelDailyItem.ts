import { ChatDailyMsgItem } from '../chat/ChatDailyMsgItem'

export interface ChatChannelDailyItem {
    /**
     * 聊天频道id
     */
    channelId: int
    /**
     * 频道聊天次数
     */
    num: int
    /**
     * 具体消息内容聊天次数
     */
    chatMsgItems?: Map<int, ChatDailyMsgItem>
}
