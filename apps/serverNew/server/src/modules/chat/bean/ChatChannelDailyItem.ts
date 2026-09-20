import { Bean } from '@arthropoda/game-engine'
import { DiffMap } from '@arthropoda/game-engine'
import { ChatDailyMsgItem } from './ChatDailyMsgItem'

export class ChatChannelDailyItem extends Bean {
    /**
     * 聊天频道id
     */
    channelId: int = 0

    /**
     * 频道聊天次数
     */
    num: int = 0

    /**
     * 具体消息内容聊天次数
     */
    chatMsgItems?: DiffMap<int, ChatDailyMsgItem>
}
