import { Bean } from '@arthropoda/game-engine'
import { DiffMap } from '@arthropoda/game-engine'
import { ChatChannelDailyItem } from './ChatChannelDailyItem'

export class ChatDailyItem extends Bean {
    /**
     * 聊天类型id
     */
    chatTypeId: int = 0

    /**
     * 各频道每日聊天次数
     */
    chatChannels?: DiffMap<int, ChatChannelDailyItem>
}
