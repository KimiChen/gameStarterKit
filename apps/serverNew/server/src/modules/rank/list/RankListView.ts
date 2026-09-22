import { UserInfoOnlyNetBean } from '../../../../generated/protocol/server/C2S/mod/user/UserInfoOnlyNetBean'

/** 排行榜列表的内部展示数据。 */
export interface RankListView {
    l: RankListItemView[]
}

export interface RankListItemView {
    score: number
    rank: int
    uId: int
    subId: int
    acAward: boolean
    ext: string
    userInfo?: UserInfoOnlyNetBean
}

export interface RankSelfView {
    rank: int
    score: number
    currentValue: int
    subId: int
    ext: string
}
