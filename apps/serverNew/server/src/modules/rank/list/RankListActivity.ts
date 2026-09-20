import { MemberType, RankRefBase } from '@arthropoda/game-engine'
import { ActivityErrors } from '../../activity/ActivityErrors'
import { ActivityScheduleResolver } from '../../activity/scheduling/ActivityScheduleResolver'
import { ActivitySchedule } from '../../activity/scheduling/ActivitySchedule'
import { ActivityRank } from '../../activity/rank/ActivityRank'
import { User } from '../../user/bean/User'
import { RankItem, ResRankGetRank } from '../RankC2S'
import { RankGuildRef } from '../ref/RankGuildRef'
import { RankUserRef } from '../ref/RankUserRef'
import { RankMemberDefine } from '../rules/RankMemberDefine'
import { RankListSystem } from './RankListSystem'

/**
 * 活动排行榜
 */
export class RankListActivity extends RankListSystem {
    /** 活动名称 */
    protected activityName: string = ''

    /** 活动信息 */
    protected activityOpenInfo!: ActivitySchedule

    protected params: string[] = []

    protected constructor() {
        super()
        //
    }

    static async create(rankType: string, user: User, params: string[]) {
        const ins = new RankListActivity()
        await ins._constructor(rankType, user, params)
        return ins
    }

    async _constructor(rankType: string, user: User, params: string[]) {
        this.rankConf = C.rank(rankType)
        this.user = user
        await this.initActivityInfo()

        if (this.rankConf.memberType == RankMemberDefine.SERVER) {
            params.push('server')
        }
        this.params = params
        await super._constructor(rankType, user, params)
    }

    /**
     * 初始化活动信息
     * @return void
     */
    async initActivityInfo() {
        // 跨服榜单 activityName_crossId
        // 跨服榜单区服  activityName_crossId_server
        this.activityName = this.rankConf.activityName!

        // 判断活动是否存在
        C.list(this.activityName)

        // 判断活动是否正在进行中
        const activityOpenInfo = await ActivityScheduleResolver.getOpen(this.user.sId, this.activityName, this.user)
        if (!activityOpenInfo || !activityOpenInfo.checkIsOpen()) {
            throw ActivityErrors.ActivityNotOpen
        }
        this.activityOpenInfo = activityOpenInfo
    }

    async initRedisRank() {
        this.redisRank = ActivityRank.getRedisRank(this.activityOpenInfo, this.params)
    }

    isCross() {
        return (this.activityOpenInfo.cross_id ?? 0) > 0
    }

    async formatList(rankList: Map<MemberType, RankRefBase>, response: ResRankGetRank) {
        let l: RankItem[]
        switch (this.memberType) {
            case RankMemberDefine.GUILD:
                l = await this.formatListGuildItem(rankList as Map<MemberType, RankGuildRef>)
                break
            case RankMemberDefine.SERVER:
                l = await this.formatListServerItem(rankList as Map<MemberType, RankUserRef>)
                break
            default:
                l = await this.formatListUserItem(rankList as Map<MemberType, RankUserRef>)
                break
        }
        response.l.push(...l)
        return l
    }

    initSelfId() {
        if (this.isCross() && this.params && this.params.includes('server')) {
            // 格式化区服排行榜
            this.memberType = RankMemberDefine.SERVER
            this.selfId = this.user.sId
            return
        }

        this.memberType = this.rankConf.memberType ?? RankMemberDefine.USER
        switch (this.memberType) {
            case RankMemberDefine.GUILD:
                this.selfId = this.user.guild
                break
            case RankMemberDefine.SERVER:
                this.selfId = this.user.sId
                break
            default:
                this.selfId = this.user.id
                break
        }
    }

    async formatSelf(selfData?: RankRefBase) {
        selfData = await this.redisRank.getTargetRankInfos(this.selfId)
        return super.formatSelf(selfData)
    }

    /**
     * 获取排行榜名称
     * @return string
     */
    public getRankName(): string {
        return C.list(this.activityName).name ?? C.rank(this.rankType).desc ?? this.activityName
    }
}
