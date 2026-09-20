import { Service } from '../../runtime/protocol/ServiceType'
import { PropItem } from '../../runtime/protocol/C2S/commom'
import { UserInfoOnlyNetBean } from '../../../generated/protocol/server/C2S/mod/user/UserInfoOnlyNetBean'

/**
 * 获取排行榜
 */
export interface ReqRankGetRank extends Service<'Base'> {
    type: string // 排行榜类型【'power':势力榜, 'hero':门客榜,'guild':联盟榜】
    num: int // 获取数量(默认99)
    params: string[]
    rankType: int // 0系统榜，1.活动榜
}
export interface ResRankGetRank {
    l: RankItem[] // 玩家排行榜
    self: RankSelf // 自身排行
    ext: int // 前端过期时间（时间戳）
    extType: int // 前端过期类型 0：过期后打开对应模块才加载，1：过期后立即加载
    isDo: boolean // 是否可膜拜
}

export interface RankItem {
    score: number // 分数
    rank: int // 排名
    uId: int // 用户id
    subId: int // 子项目id
    acAward: boolean // 手动领取奖励(冲榜)
    ext: string // 额外参数
    userInfo?: UserInfoOnlyNetBean // 玩家信息
    // guildInfo: CommonGuildInfo  // 联盟信息
}

export interface RankSelf {
    rank: int // 排行
    score: number // 分值
    currentValue: int // 当前值
    subId: int // 子项目id
    ext: string // 额外参数
}

/**
 * 获取自身排行
 */
export interface ReqRankGetSelfRank extends Service<'Base'> {
    type: string // 排行榜类型(多个以逗号拼接)
}

export interface ResRankGetSelfRank {
    l: RankSelfItem
}

export interface RankSelfItem {
    rank: int // 排行
    score: number // 分值
    type: string // 排行榜类型
}

/**
 * 膜拜
 */
export interface ReqRankWorship extends Service<'Base'> {
    type: string // 排行榜类型
}
export interface ResRankWorship {
    uId: int //用户id
    guildId: int //联盟id
    rank: int //排名
    awards: PropItem[]
    score: int //分数
}

/**
 * 总排行榜大入口
 */
export interface ReqRankGetDailyInfo extends Service<'Base'> {}
export interface ResRankGetDailyInfo {
    info: PbRankDailyInfo[]
}
export interface PbRankDailyInfo {
    id: int // 类型id 1个人、2装备、3妖盟、4副本
    rankType: string // 排行榜类型
    memberId: string // 玩家id、联盟id
    itemId: string // 装备id等
    rank: int // 排名
    score: int // 积分
    userInfo?: UserInfoOnlyNetBean // 玩家信息
    // guildInfo: CommonGuildInfo // 联盟信息
}
