import { UserInfoOnlyNetBean } from '../../../../generated/protocol/server/C2S/mod/user/UserInfoOnlyNetBean'

/** 每日排行榜摘要的内部展示数据。 */
export interface RankDailyView {
    id: int
    rankType: string
    memberId: string
    itemId: string
    rank: int
    score: int
    userInfo?: UserInfoOnlyNetBean
}
