import { Bean } from '@arthropoda/game-engine'

export class TitleItem extends Bean {
    /**
     * 称号id
     */
    id: int = 0

    /**
     * 过期时间
     */
    expire: int = 0

    /**
     * 是否已读
     */
    isRead: boolean = false
}
