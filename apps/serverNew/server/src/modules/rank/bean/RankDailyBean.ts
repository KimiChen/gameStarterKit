import { ServerHashJson } from '@arthropoda/game-engine'
import { UtilTime } from '@arthropoda/game-engine'

export class RankDailyBean extends ServerHashJson {
    id: int = 0

    /**
     * 榜单组id
     */
    rankId: int = 0

    /**
     * 榜单类型
     */
    rankType: string = ''

    /**
     * 成员id
     */
    memberId: string = ''

    /**
     * 附加信息
     */
    itemId: string = ''

    /**
     * 成员id
     */
    rank: int = 0

    /**
     * 分数
     */
    score: int = 0

    expireTime(): number {
        return 3 * UtilTime.DAY_SECOND
    }
}
