import { ChatChannelDailyItem } from '../chat/ChatChannelDailyItem'

export interface ChatDailyItem {
    /**
     * 聊天类型id
     */
    chatTypeId: int
    /**
     * 各频道每日聊天次数
     */
    chatChannels?: Map<int, ChatChannelDailyItem>
}
