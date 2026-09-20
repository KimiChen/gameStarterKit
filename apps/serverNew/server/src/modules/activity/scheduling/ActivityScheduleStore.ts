import { RedisInstance, timestamp } from '@arthropoda/game-engine'
import { Mutex } from 'async-mutex'
import { ActivityStageBean } from '../bean/ActivityStageBean'
import { ActivityConfigCache } from '../config/ActivityConfigCache'
import { ActivityStateKeys } from '../rules/ActivityStateKeys'
import { ActivitySchedule } from './ActivitySchedule'

export class ActivityScheduleStore {
    private static serverId2OpenInfo: Map<int, Map<string, ActivitySchedule>> = new Map()

    private static serverId2LoadedTimeVer: Map<int, string> = new Map()

    private static readonly mutexOfLoadOpenInfo = [new Mutex(), new Mutex(), new Mutex()]

    static async getOrLoadServerOpenInfo(sId: int): Promise<Map<string, ActivitySchedule>> {
        if (!this.serverId2LoadedTimeVer.has(sId)) {
            const lockIndex = sId % this.mutexOfLoadOpenInfo.length
            await this.mutexOfLoadOpenInfo[lockIndex].runExclusive(async () => {
                if (this.serverId2LoadedTimeVer.has(sId)) return

                const ver = await this.loadActivityTimeVer(sId)
                this.serverId2LoadedTimeVer.set(sId, ver)
                this.serverId2OpenInfo.delete(sId)
                await this.loadActivityStageToOpenInfo(sId)
                const serverOpenInfo = this.serverId2OpenInfo.get(sId)!
                for (const [name, schedule] of serverOpenInfo) {
                    await ActivityConfigCache.loadConfToStatic(sId, name, schedule.salt, schedule.id)
                }
            })
        }
        return this.serverId2OpenInfo.get(sId) ?? new Map()
    }

    static async updateServerTimeVerExpiredStatus() {
        const versions = await this.loadActivityTimeVerAll()
        for (const [sId, newTimeVer] of versions) {
            if (newTimeVer !== this.serverId2LoadedTimeVer.get(sId)) this.serverId2LoadedTimeVer.delete(sId)
        }
    }

    static async loadActivityTimeVer(sId: int): Promise<string> {
        return (await RedisInstance.getCenterRedis().hGet(ActivityStateKeys.ActivitySyncTimeVer, String(sId))) ?? ''
    }

    static async loadActivityTimeVerAll(): Promise<Map<number, string>> {
        const data = await RedisInstance.getCenterRedis().hGetAll(ActivityStateKeys.ActivitySyncTimeVer)
        const versions = new Map<number, string>()
        for (const key in data) versions.set(Int(key), data[key])
        return versions
    }

    private static async loadActivityStageToOpenInfo(sId: number) {
        const now = timestamp()
        const activities = await ActivityStageBean.loadAll(undefined, { serverId: sId })
        const schedules: Map<string, ActivitySchedule> = new Map()
        for (const [, item] of activities) {
            if (item.openInfo!.openTs > now) continue
            schedules.set(item.activityName, new ActivitySchedule(item))
        }
        this.serverId2OpenInfo.set(sId, schedules)
    }
}
