import { Activity } from '../bean/Activity'
import { User } from '../../user/bean/User'
import { ActivitySchedule } from '../scheduling/ActivitySchedule'

/**
 * 活动操作抽象类
 * 像rank一样每个活动类型建立operator类, 框架按list表中 typeActivityName 寻找对应类 @see ActivityHelper.getActivityOperator
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
export abstract class ActivityOperator {
    activityOpenInfo: ActivitySchedule

    //对应的活动配置 领奖结束有可能活动已经关闭下一轮活动已经开启，所以不能直接用配置文件中的配置数据
    activityConf!: any

    /**
     * 有时需要有一个结算过程，延时发奖,比如到领奖阶段5分钟后才能领取奖励
     */
    awardDelayTime: int = 0

    constructor(activityOpenInfo: ActivitySchedule) {
        this.activityOpenInfo = activityOpenInfo
    }

    /**
     * 加载活动数据
     */
    abstract getInfo(user: User, modInfo: Activity): void

    /**
     * 活动开始逻辑
     * @param activityConf
     *
     */
    async onActivityStart() {
        return
    }

    /**
     * 活动结束（结束后不再统计，不能再进行活动操作）
     */
    async onActivityEnd() {
        return
    }

    /**
     * 活动领奖结束（奖励补发）
     */
    async onActivityAwardEnd() {
        return
    }

    /**
     * 活动关闭逻辑（icon结束）
     */
    async onActivityClose() {
        return
    }
}
