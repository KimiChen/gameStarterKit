import { Bean } from '@arthropoda/game-engine'

export class GuildNoticeItem extends Bean {
    /**
     * 类型id
     */
    id: int = 0

    /**
     * 上次提醒时间
     */
    lastNoticeTime: int = 0
}
