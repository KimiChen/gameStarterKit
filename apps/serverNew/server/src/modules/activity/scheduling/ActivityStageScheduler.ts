import { RedisInstance, timestamp, UtilTime } from '@arthropoda/game-engine'
import { ServerActivityModel } from '../../../../generated/persistence/ServerActivityModel'
import { LocalAction } from '../../../runtime/action/LocalAction'
import { QueuedLocalAction } from '../../../runtime/action/QueuedLocalAction'
import { ActionActivityStageTask } from '../action/ActionActivityStageTask'
import { ActivityStageBean } from '../bean/ActivityStageBean'
import { ActivityClientAssembler } from '../client/ActivityClientAssembler'
import { ActivityConfigCache } from '../config/ActivityConfigCache'
import { ActivityOperator } from '../operation/ActivityOperator'
import { ActivityOperatorRegistry } from '../operation/ActivityOperatorRegistry'
import { ActivityRefresh } from '../refresh/ActivityRefresh'
import { ActivitySchedule } from './ActivitySchedule'
import { ActivityScheduleResolver } from './ActivityScheduleResolver'

export class ActivityStageScheduler {
    static readonly ACTIVITY_STAGE_START_BEFORE = 0

    static readonly ACTIVITY_STAGE_START = 1

    static readonly ACTIVITY_STAGE_END = 2

    static readonly ACTIVITY_STAGE_AWARD_END = 3

    static readonly ACTIVITY_STAGE_CLOSE = 4

    static readonly USER_AWARD = 1

    static readonly GUILD_AWARD = 2

    static async checkActivityStageTask(sId: int) {
        let minNextStageTime = 0
        const activityStages = await ActivityStageBean.loadAll(undefined, { serverId: sId })
        let hasUpdateStage = false
        for (const [, item] of activityStages) {
            const activityName = item.activityName
            const listConf = C.list(activityName)
            if (!listConf || listConf.openBy === ActivityScheduleResolver.OPEN_BY_NORMAL) {
                item.delete()
                continue
            }

            const oldStage = item.stage
            const nextStageTime = await this.updateActivityStage(sId, listConf, item)
            if (nextStageTime > 0) {
                minNextStageTime = minNextStageTime > 0 ? Math.min(minNextStageTime, nextStageTime) : nextStageTime
            } else {
                item.delete()
                const cacheKey = ActivityConfigCache.getConfCacheKey(sId, activityName, item.salt)
                const salt = ActivityConfigCache.getConfSalt(sId, activityName)
                if (salt !== item.salt) {
                    await RedisInstance.getServerRedis().expire(cacheKey, UtilTime.DAY_SECOND * 3)
                }
            }
            if (item.stage !== oldStage) {
                hasUpdateStage = true
                break
            }
        }

        if (hasUpdateStage) {
            LocalAction.send(ActionActivityStageTask, { sid: sId }, 0, sId)
            return
        }
        if (minNextStageTime > 0) {
            await QueuedLocalAction.rpc(ActionActivityStageTask, { sid: sId }, 0, sId, minNextStageTime)
        }
    }

    static async updateActivityStage(sId: int, listConf: IConfList, stage: ActivityStageBean) {
        if (stage.stage >= this.ACTIVITY_STAGE_CLOSE) return 0

        const activityName = stage.activityName
        const schedule = new ActivitySchedule(stage)
        const dbActivity = await ServerActivityModel.findOneBy({ id: stage.id })
        if (
            !dbActivity ||
            dbActivity.status === ActivityRefresh.STATUS_DEL ||
            dbActivity.status === ActivityRefresh.STATUS_CLOSE
        ) {
            return 0
        }

        const operator = (await ActivityOperatorRegistry.getActivityOperator(sId, schedule.name))!
        operator.activityOpenInfo = schedule
        operator.activityConf = await ActivityClientAssembler.getActivityConf(sId, listConf, schedule, false)
        const now = timestamp()
        let nextStageTime = 0
        let currentStage = this.ACTIVITY_STAGE_CLOSE
        if (now < schedule.start_ts) {
            nextStageTime = schedule.start_ts
            currentStage = this.ACTIVITY_STAGE_START_BEFORE
        } else if (now < schedule.end_ts) {
            nextStageTime = schedule.end_ts
            if (schedule.award_end > schedule.end_ts) nextStageTime += 3
            currentStage = this.ACTIVITY_STAGE_START
        } else if (now < schedule.award_end) {
            nextStageTime = schedule.award_end
            currentStage = this.ACTIVITY_STAGE_END
        } else if (now < schedule.close_ts) {
            nextStageTime = schedule.close_ts
            currentStage = this.ACTIVITY_STAGE_AWARD_END
        }

        while (stage.stage < currentStage) {
            if (
                stage.stage + 1 === this.ACTIVITY_STAGE_END &&
                schedule.award_end > schedule.end_ts &&
                now - schedule.end_ts < 3
            ) {
                return schedule.end_ts + 3
            }
            stage.stage++
            Log.info(`执行活动阶段性任务 activityName:${activityName},id:${stage.id},stage:${stage.stage}`)
            await this.doActivityStageTask(listConf, stage.stage, operator)
        }
        return nextStageTime
    }

    static async doActivityStageTask(listConf: IConfList, stage: int, operator: ActivityOperator) {
        if (listConf.fromDB > 0 && !operator.activityConf) {
            Log.error('获取已过期的活动配置失败！ 阶段任务未能正常执行 stage：' + stage)
            return
        }
        switch (stage) {
            case this.ACTIVITY_STAGE_START:
                await operator.onActivityStart()
                break
            case this.ACTIVITY_STAGE_END:
                await operator.onActivityEnd()
                break
            case this.ACTIVITY_STAGE_AWARD_END:
                await operator.onActivityAwardEnd()
                break
            case this.ACTIVITY_STAGE_CLOSE:
                await operator.onActivityClose()
                break
        }
    }
}
