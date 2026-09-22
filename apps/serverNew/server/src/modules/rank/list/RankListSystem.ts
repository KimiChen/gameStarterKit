import { User } from '../../user/bean/User'
import { RankGuildRef } from '../ref/RankGuildRef'
import { RankUserRef } from '../ref/RankUserRef'
import { UserBaseRef } from '../../user/ref/UserBaseRef'
import { RankDefine } from '../rules/RankDefine'
import { RankMemberDefine } from '../rules/RankMemberDefine'
import { RedisInstance } from '@arthropoda/game-engine'
import { DiffRank } from '@arthropoda/game-engine'
import { RankRefBase } from '@arthropoda/game-engine'
import { timestamp } from '@arthropoda/game-engine'
import { UserProfileFormatter } from '../../user/action/UserProfileFormatter'
import { RankAccess } from '../persistence/RankAccess'
import { MemberType } from '@arthropoda/game-engine'
import { RankListItemView, RankListView, RankSelfView } from './RankListView'

/**
 * 排行榜
 */
export class RankListSystem {
    /** 排行榜成员类型 */
    protected memberType: string = ''

    /** 排行榜类型 */
    protected rankType: string = ''

    /** uId/guildId/serverId */
    protected selfId: int = 0

    /** 玩家 */
    protected user!: User

    /** 最大数量 */
    protected maxNum: int = 0

    /** 参数 */
    protected params: string[] = []

    /** redis排行榜 */
    protected redisRank!: DiffRank

    /** 排行榜配置 */
    protected rankConf!: IConfRank

    protected constructor() {
        //
    }

    static async create(rankType: string, user: User, params: string[]) {
        const ins = new RankListSystem()
        await ins._constructor(rankType, user, params)
        return ins
    }

    async _constructor(rankType: string, user: User, params: string[]) {
        this.rankType = rankType
        this.user = user
        this.params = params
        this.initSelfId(user)
        this.initMaxNum()
        this.initRedisRank()
    }

    protected initRedisRank() {
        this.redisRank = RankAccess.getRedisRank(this.rankType, this.user.sId, ...this.params)
    }

    protected initMaxNum() {
        return (this.maxNum = C.rank(this.rankType).maxNum ?? 100)
    }

    public getMaxNum() {
        return this.maxNum
    }

    public getRedisRank() {
        return this.redisRank
    }

    public isCross() {
        return RankDefine.CONF.get(this.rankType)?.isCenter ?? false
    }

    public frontExpireTime() {
        return timestamp() + RankAccess.FRONT_EXPIRE_TIME
    }

    public getSelfId() {
        return this.selfId
    }

    /**
     * 设置排行Id
     * @param user
     */
    public initSelfId(user: User) {
        this.memberType = RankDefine.CONF.get(this.rankType)?.memberType ?? RankMemberDefine.USER
        switch (this.memberType) {
            case RankMemberDefine.GUILD:
                this.selfId = user.guild
                break
            case RankMemberDefine.SERVER:
                this.selfId = user.sId
                break
            default:
                this.selfId = user.id
                break
        }
    }

    /**
     * 格式化排行榜
     * @param rankList typeof RankBaseRef
     * @param response
     * @returns
     */
    public async formatList(rankList: Map<MemberType, RankRefBase>, response: RankListView) {
        const rankRef = RankDefine.CONF.get(this.rankType)?.rankRef ?? RankRefBase
        let l: RankListItemView[] = []
        if (rankRef instanceof RankGuildRef) {
            l = await this.formatListGuildItem(rankList as Map<MemberType, RankGuildRef>)
        } else {
            l = await this.formatListUserItem(rankList as Map<MemberType, RankUserRef>)
        }
        response.l = l
        return l
    }

    /**
     * 联盟排行榜
     * @param rankList
     * @returns
     */
    async formatListGuildItem(rankList: Map<MemberType, RankGuildRef>) {
        const result: RankListItemView[] = []
        if (!rankList) {
            return result
        }

        const leaderIds: int[] = []
        for (const [, guildRef] of rankList) {
            leaderIds.push(guildRef.leaderId)
        }
        const leaders = await UserBaseRef.loadAll(leaderIds)

        for (const [, rankData] of rankList) {
            const item: RankListItemView = {
                uId: rankData.leaderId,
                rank: rankData.rank, //排名
                score: Int(rankData.score), //分数
                subId: 0,
                acAward: false,
                ext: '',
            }
            const leaderUser = leaders.get(rankData.leaderId)
            if (leaderUser) {
                item.userInfo = UserProfileFormatter.format(leaderUser).toModData() as any
            }
            result.push(item)
        }
        return result
    }

    /**
     * 玩家排行榜
     * @param rankList
     * @returns
     */
    async formatListUserItem(rankList: Map<MemberType, RankUserRef>) {
        const result: RankListItemView[] = []
        if (!rankList) {
            return result
        }
        const uIds = Array.from(rankList.keys())
        const users = await UserBaseRef.loadAll(uIds)
        let subInfos
        if (!RankDefine.CONF.get(this.rankType)?.subInfo) {
            const infoKey = RankAccess.formatRankInfoKey(this.rankType, this.user.sId, ...this.params)
            subInfos = await RedisInstance.getServerRedis().hmGet(infoKey, uIds)
        }
        for (const [id, rankData] of rankList) {
            const item: RankListItemView = {
                uId: Int(id),
                rank: rankData.rank, //排名
                score: Int(rankData.score), //分数
                subId: 0,
                acAward: false,
                ext: '',
            }
            const user = users.get(rankData.id)
            if (user) {
                item.userInfo = UserProfileFormatter.format(user).toModData() as any
            }
            if (subInfos) {
                item.ext = subInfos[rankData.id] ?? ''
            }
            result.push(item)
        }
        return result
    }

    /**
     * 区服排行榜
     * @param rankList
     * @returns
     */
    async formatListServerItem(rankList: Map<MemberType, RankUserRef>) {
        const result: RankListItemView[] = []
        if (!rankList) {
            return result
        }
        for (const [id, rankData] of rankList) {
            const item: RankListItemView = {
                uId: Int(id),
                rank: rankData.rank,
                score: Int(rankData.score),
                subId: 0,
                acAward: false,
                ext: '',
            }
            result.push(item)
        }
        return result
    }

    /**
     * 生成玩家排名信息
     * @param selfData
     * @returns RankSelf
     */
    async formatSelf(selfData?: RankRefBase) {
        if (!selfData) {
            return null
        }
        let rank = selfData.rank
        let ext = ''
        if (selfData.rank > this.maxNum) {
            rank = 0
        } else if (!RankDefine.CONF.get(this.rankType)?.subInfo) {
            const infoKey = RankAccess.formatRankInfoKey(this.rankType, this.user.sId, ...this.params)
            ext = (await RedisInstance.getServerRedis().hGet(infoKey, this.selfId.toString())) ?? ''
        }
        const rankSelf: RankSelfView = {
            rank: rank,
            score: Int(selfData.score),
            ext: ext,
            currentValue: 0,
            subId: 0,
        }
        return rankSelf
    }

    /**
     * 榜单是否可点赞
     * @return bool
     */
    public isCanLike() {
        return (C.rank(this.rankType)?.isRankLike ?? 0) == 1
    }

    /**
     * 获取排行榜名称
     * @return string
     */
    public getRankName(): string {
        return C.rank(this.rankType)?.desc ?? this.rankType
    }
}
