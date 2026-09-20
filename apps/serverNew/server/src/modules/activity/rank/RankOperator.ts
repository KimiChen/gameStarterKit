import { ServerUserModel } from '../../../../generated/persistence/ServerUserModel'
import { FeatureAccess } from '../../../modules/user/access/FeatureAccess'
import { ModuleOpenType } from '../../user/access/ModuleOpenType'
import { User } from '../../user/bean/User'
import { PowerScoreRules } from '../../user/rules/PowerScoreRules'
import { ActivityErrors } from '../ActivityErrors'
import { Activity } from '../bean/Activity'
import { ActivityRankItemBean } from '../bean/ActivityRankItemBean'
import { RankAwardItemBean } from '../bean/RankAwardItemBean'
import { ActivityClientAssembler } from '../client/ActivityClientAssembler'
import { ActivityOperator } from '../operation/ActivityOperator'
import { ActivityDefine } from '../rules/ActivityDefine'
import { ActivityRankDefine } from '../rules/ActivityRankDefine'
import { ActivityRank } from './ActivityRank'
import { ActivityRankAward } from './ActivityRankAward'
import { ActivityRankFinalize } from './ActivityRankFinalize'

export class RankOperator extends ActivityOperator {
    /**
     * 获取信息
     * @param user
     * @param modInfo
     */
    async getInfo(user: User, modInfo: Activity) {
        const activityName = this.activityOpenInfo.name

        const pb = new ActivityRankItemBean()
        pb.activityName = activityName
        pb.isCross = this.activityOpenInfo.cross_id > 0

        const awardCache = await ActivityRank.loadUserAwardCache(user.id, this.activityOpenInfo)
        if (awardCache && awardCache.awardInfos) {
            for (const [, awardInfo] of awardCache.awardInfos) {
                const pbAward = new RankAwardItemBean()
                pbAward.type = awardInfo.type
                pbAward.state = awardInfo.state
                pbAward.rank = awardInfo.rank
                pb.awardInfos.set(pbAward.type, pbAward)
            }
        }

        // 判断是否已结算
        pb.settlement = !(await ActivityRank.loadUserAwardCache(0, this.activityOpenInfo))
        modInfo.activityRankInfo.set(activityName, pb)
    }

    /**
     * 活动领奖结束（奖励补发）
     * @param activityConf 对应的活动配置 领奖结束有可能活动已经关闭下一轮活动已经开启，所以不能直接用配置文件中的配置数据
     */
    async onActivityAwardEnd() {
        await ActivityRankAward.reissue(this.activityOpenInfo, this.activityConf)
    }

    /**
     * 活动开始逻辑
     * @param activityConf 对应的活动配置 领奖结束有可能活动已经关闭下一轮活动已经开启，所以不能直接用配置文件中的配置数据
     */
    async onActivityStart() {
        const activityName = this.activityOpenInfo.name
        const listConf = C.list(activityName)

        if (!listConf) {
            return
        }

        switch (activityName) {
            case ActivityDefine.RankLevel:
                {
                    // 角色等级冲榜
                    const users = await ServerUserModel.find({
                        select: ['userId', 'userLevel'],
                    })
                    const redisRank = ActivityRank.getRedisRank(this.activityOpenInfo)
                    for (const user of users) {
                        await redisRank.set(user.userId, user.userLevel)
                    }
                }
                break
            case ActivityDefine.RankWeapon:
                {
                    // 法宝等级冲榜
                    const users = await ServerUserModel.find({
                        select: ['userId'],
                    })
                    const redisRank = ActivityRank.getRedisRank(this.activityOpenInfo)
                    for (const user of users) {
                        const u = await User.load(user.userId)
                        if (!u) {
                            continue
                        }
                        if (u.weapon.lv <= 0 || !FeatureAccess.check(u, ModuleOpenType.SYS_WEAPON)) {
                            continue
                        }
                        const conf = C.weapon(u.weapon.lv)
                        if (conf) {
                            await redisRank.set(user.userId, conf.showLv)
                        }
                    }
                }
                break
            case ActivityDefine.RankGong:
                {
                    // 功法等级冲榜
                    const users = await ServerUserModel.find({
                        select: ['userId'],
                    })
                    const redisRank = ActivityRank.getRedisRank(this.activityOpenInfo)
                    for (const user of users) {
                        const u = await User.load(user.userId)
                        if (!u) {
                            continue
                        }
                        if (u.gong.lv <= 0 || !FeatureAccess.check(u, ModuleOpenType.SYS_GONG)) {
                            continue
                        }
                        const conf = C.gong(u.weapon.lv)
                        if (conf) {
                            await redisRank.set(user.userId, conf.showLv)
                        }
                    }
                }
                break
            case ActivityDefine.RankGongFp:
            case ActivityDefine.RankWeaponFp:
            case ActivityDefine.RankEquipFp:
                {
                    // 评分冲榜
                    const users = await ServerUserModel.find({
                        select: ['userId'],
                    })
                    const redisRank = ActivityRank.getRedisRank(this.activityOpenInfo)
                    for (const user of users) {
                        const u = await User.load(user.userId)
                        if (!u) {
                            continue
                        }
                        const score = PowerScoreRules.getActivityRankFp(u, activityName)
                        if (!score) {
                            continue
                        }
                        await redisRank.set(user.userId, score)
                    }
                }
                break
        }
    }

    /**
     * 活动结束（锁定排行榜）
     * @param activityConf
     */
    async onActivityEnd() {
        await ActivityRankFinalize.run(this.activityOpenInfo, this.activityConf)
    }

    /**
     * 领取排行榜
     * @param user
     * @param gearId
     * @param ext
     * @returns
     */
    async onGearAward(user: User, gearId: int, ext: any) {
        if (!this.activityOpenInfo || !this.activityOpenInfo.checkIsAwardTime()) {
            throw ActivityErrors.ActivityNotAward
        }

        const cache = await ActivityRank.loadUserAwardCache(user.id, this.activityOpenInfo)
        if (!cache) {
            // 定榜时不存在说明没有上榜
            throw ActivityErrors.ActivityCanNotAward
        }

        const activityName = this.activityOpenInfo.name
        const activityConf = await ActivityClientAssembler.getActivityConf(
            user.sId,
            C.list(activityName),
            this.activityOpenInfo,
            false,
        )
        const object = new ActivityRankAward(this.activityOpenInfo, activityConf)

        const awardItem = cache.awardInfos.get(gearId)
        if (!awardItem) {
            // 定榜时不存在说明没有上榜
            throw ActivityErrors.ActivityCanNotAward
        }

        if (awardItem.state != ActivityRankDefine.AWARD_CAN_GET) {
            // 判断是否已经领奖
            throw ActivityErrors.ActivityHasAward
        }

        // 奖励获取
        let awards
        if (gearId == ActivityRankDefine.AWARD_TYPE_SERVER) {
            awards = object.gearCrossAward(awardItem)
        } else {
            awards = object.gearSelfAward(awardItem)
        }
        if (!awards) {
            throw ActivityErrors.ActivityCanNotAward
        }

        awardItem.state = ActivityRankDefine.AWARD_ALREADY_GET

        // 发送已经领取的change

        //初始化Mod
        const mod = new Activity(user.id)
        const modRank = new ActivityRankItemBean()
        mod.activityRankInfo.buildNet([[activityName, modRank]])

        // 初始化rankAwardItem,在修改状态值生成change
        const modAward = new RankAwardItemBean()
        modRank.awardInfos.buildNet([[gearId, modAward]])
        modAward.state = awardItem.state

        return awards
    }
}
