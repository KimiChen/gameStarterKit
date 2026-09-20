import { timestamp, UtilTime } from '@arthropoda/game-engine'
import { User } from '../../user/bean/User'
import { ServerAvailabilityRules } from '../../serverSettings/runtime/ServerAvailabilityRules'
import { ActivityStageBean } from '../bean/ActivityStageBean'
import { ActivityConfigCache } from '../config/ActivityConfigCache'
import { ActivitySchedule } from './ActivitySchedule'
import { ActivityScheduleStore } from './ActivityScheduleStore'

export class ActivityScheduleResolver {
    static readonly OPEN_BY_SET = 'set'

    static readonly OPEN_BY_NORMAL = 'normal'

    static readonly OPEN_BY_OPEN_TIME = 'openTime'

    static readonly OPEN_BY_INIT_TIME = 'initTime'

    static async getOpenList(sId: int, user: User, activityNames: string[] = []) {
        const schedules: ActivitySchedule[] = []
        const needFilter = activityNames.length > 0
        for (const [, activityConf] of C.list()) {
            if (needFilter && !activityNames.includes(activityConf.activityName)) continue
            const schedule = await this.getOpen(sId, activityConf.activityName, user)
            if (schedule != null) schedules.push(schedule)
        }
        return schedules
    }

    static async getOpen(sId: int, activityName: string, user?: User) {
        let schedule = this.getOpenCache(sId, activityName)
        if (!schedule) {
            schedule = await this.parseActivity(sId, activityName, user)
            if (schedule) this.setOpenCache(sId, activityName, schedule)
        }
        return schedule
    }

    private static getOpenCache(sId: int, activityName: string): ActivitySchedule | undefined {
        return Ctx.activityName2openInfo?.[sId]?.[activityName]
    }

    private static setOpenCache(sId: int, activityName: string, schedule: ActivitySchedule) {
        const listConf = C.list(activityName)
        Ctx.gameTableName2SpaceKey ??= {}
        Ctx.activityName2openInfo ??= {}
        Ctx.activityName2openInfo[sId] ??= {}
        Ctx.gameTableName2SpaceKey[listConf.fromName] = ActivityConfigCache.getConfSpaceKey(
            schedule.name,
            schedule.salt,
        )
        Ctx.activityName2openInfo[sId][activityName] = schedule
    }

    static async parseActivity(sId: int, activityName: string, user?: User): Promise<ActivitySchedule | undefined> {
        const listConf = C.list(activityName)
        if (!listConf) return

        const nowTime = timestamp()
        let schedule: ActivitySchedule | undefined
        switch (listConf.openBy) {
            case this.OPEN_BY_SET:
                schedule = (await ActivityScheduleStore.getOrLoadServerOpenInfo(sId)).get(activityName)
                break
            case this.OPEN_BY_OPEN_TIME: {
                const serverOpenTime = await ServerAvailabilityRules.getOnlySvOpenTime(sId)
                const serverOpenTs = UtilTime.getDayStartTime(serverOpenTime)
                const start = serverOpenTs + (listConf.openDay - 1) * UtilTime.DAY_SECOND
                const end = start + (listConf.lastDays ?? 0) * UtilTime.DAY_SECOND
                schedule = await this.initNormalActivitySchedule(sId, listConf, nowTime, start, end)
                break
            }
            case this.OPEN_BY_INIT_TIME: {
                if (!user) return
                const start = user.initTime + (listConf.openDay - 1) * UtilTime.DAY_SECOND
                const end = start + (listConf.lastDays ?? 0) * UtilTime.DAY_SECOND
                schedule = await this.initNormalActivitySchedule(sId, listConf, nowTime, start, end)
                break
            }
            case this.OPEN_BY_NORMAL: {
                const start = UtilTime.getDayStartTime(nowTime)
                const end = nowTime + 30 * UtilTime.DAY_SECOND
                schedule = await this.initNormalActivitySchedule(sId, listConf, nowTime, start, end)
                break
            }
            default:
                throw Error('活动开启类型错误：' + listConf.openBy)
        }

        if (schedule) schedule.parseTime = nowTime
        return schedule
    }

    static async initNormalActivitySchedule(sId: int, conf: IConfList, nowTime: int, start: int, end: int) {
        if (!(await ServerAvailabilityRules.getOnlySvOpenTime(sId))) return
        if (nowTime >= end || nowTime < start) return

        const schedule = new ActivitySchedule()
        schedule.id = 0
        schedule.name = conf.activityName
        schedule.open_ts = start
        schedule.start_ts = start
        schedule.award_start = start
        schedule.award_end = end
        schedule.close_ts = end
        schedule.end_ts = end
        if (conf.fromDB > 0) {
            const cache = await ActivityStageBean.load(sId.toString(), conf.activityName)
            schedule.salt = cache?.salt ?? ' '
        }
        schedule.startDate = UtilTime.getDayStartTime(start)
        return schedule
    }
}
