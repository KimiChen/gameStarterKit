import { RankAwardItemBean } from '../activity/RankAwardItemBean'

export interface RankAwardBean {
    /**
     * 玩家id
     */
    id: int
    /**
     * 玩家id
     */
    uId: int
    /**
     * 排名，联盟冲榜表示联盟排名
     */
    rank: int
    /**
     * 领奖信息
     */
    awardInfos?: Map<int, RankAwardItemBean>
}
