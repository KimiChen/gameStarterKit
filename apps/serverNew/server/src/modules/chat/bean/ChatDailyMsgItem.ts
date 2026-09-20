import { Bean } from '@arthropoda/game-engine'

export class ChatDailyMsgItem extends Bean {
    /**
     * 聊天内容唯一标识
     */
    contentId: int = 0

    /**
     * 聊天次数
     */
    num: int = 0
}
