import { RedisInstance, timestamp } from '@arthropoda/game-engine'
import { MoreThan } from '@arthropoda/typeorm'
import { ServerActivityModel } from '../../../../generated/persistence/ServerActivityModel'
import { QueuedLocalAction } from '../../../runtime/action/QueuedLocalAction'
import { ServerSettingStore } from '../../serverSettings/runtime/ServerSettingStore'
import { ServerSettingDefine } from '../../serverSettings/rules/ServerSettingDefine'
import { ActionActivityOpenReload } from '../action/ActionActivityOpenReload'
import { ActivityItemBean } from '../bean/ActivityItemBean'
import { ActivityStageBean } from '../bean/ActivityStageBean'
import { ActivityConfigCache } from '../config/ActivityConfigCache'
import { ActivityDefine } from '../rules/ActivityDefine'
import { ActivityStateKeys } from '../rules/ActivityStateKeys'
import { ActivityScheduleStore } from '../scheduling/ActivityScheduleStore'
import { ActivityStageScheduler } from '../scheduling/ActivityStageScheduler'

export class ActivityRefresh {
    static readonly STATUS_NORMAL = 1

    static readonly STATUS_DEL = 2

    static readonly STATUS_CLOSE = 3

    static readonly DEL_SUCCESS = 100

    static async getActivitiesFromDb(sId: int) {
        const now = timestamp()
        return ServerActivityModel.find({
            where: [{ sid: sId, closeTs: MoreThan(now), status: this.STATUS_NORMAL }],
        })
    }

    static async refreshActivitiesCache(sId: int): Promise<boolean> {
        const activities = await this.getActivitiesFromDb(sId)
        if (activities.length === 0) return false

        const oldTimeVer = await ActivityScheduleStore.loadActivityTimeVer(sId)
        let futureActivityTs = 0
        const curTs = timestamp()
        const openedActivities = []

        for (const activity of activities) {
            if (activity.openTs > curTs) {
                futureActivityTs = futureActivityTs > 0 ? Math.min(futureActivityTs, activity.openTs) : activity.openTs
                continue
            }
            openedActivities.push(activity)
        }

        const redis = RedisInstance.getServerRedis()
        for (const activity of openedActivities) {
            const listConf = C.list(activity.name)
            if (listConf.fromDB > 0) {
                const cacheKey = ActivityConfigCache.getConfCacheKey(sId, activity.name, activity.salt)
                await redis.set(cacheKey, activity.activityConf, ActivityConfigCache.ACTIVITY_CACHE_EXPIRE_TS)
            }

            let stage = await ActivityStageBean.load(activity.id, undefined, { serverId: sId })
            if (stage == null) {
                stage = new ActivityStageBean(activity.id, undefined, { serverId: sId })
                stage.sId = activity.sid
                stage.activityId = activity.id
                stage.activityName = activity.name
                stage.stage = ActivityStageScheduler.ACTIVITY_STAGE_START_BEFORE
            }
            stage.salt = activity.salt
            stage.openInfo = new ActivityItemBean(activity)

            if (listConf.crossType === ActivityDefine.CROSS_TYPE_CROSS && activity.crossId) {
                const serverIds = JSON.parse(activity.serverId)
                if (!serverIds) {
                    Log.error(
                        `跨服活动参与区服列表有问题!activityName:${activity.name} activityId:${activity.id} server_id:${activity.serverId}`,
                        new Error('堆栈信息'),
                    )
                } else {
                    const sIds = []
                    for (const itemSid of serverIds) {
                        if (typeof itemSid !== 'number') {
                            Log.error(
                                `跨服活动参与区服列表有问题!activityName:${activity.name} activityId:${activity.id} server_id:${activity.serverId}`,
                                new Error('堆栈信息'),
                            )
                            continue
                        }
                        sIds.push(parseInt(itemSid.toString()))
                    }
                    stage.sIds.init(sIds)
                }
            }
        }

        const newTimeVer = await this.refreshActivityTimeVer(sId)
        if (futureActivityTs > 0) {
            await QueuedLocalAction.rpc(ActionActivityOpenReload, { sIds: [sId] }, 0, sId, futureActivityTs)
        }
        return oldTimeVer !== newTimeVer
    }

    static async refreshActivityTimeVer(sId: int) {
        const now = timestamp()
        let maxTime = 0
        const activities = await ActivityStageBean.loadAll(undefined, { serverId: sId })
        for (const [, item] of activities) {
            if (item.openInfo!.openTs > now) continue
            maxTime = Math.max(maxTime, item.openInfo!.openTs)
        }
        const activityTag = await ServerSettingStore.loadSettingValue(sId, ServerSettingDefine.TAG_ACTIVITY)
        const newTimeVer = `${activityTag}/${maxTime}`
        await RedisInstance.getCenterRedis().hSet(ActivityStateKeys.ActivitySyncTimeVer, sId, newTimeVer)
        return newTimeVer
    }
}
