import { Config, RedisInstance } from '@arthropoda/game-engine'
import { ServerActivityModel } from '../../../../generated/persistence/ServerActivityModel'
import { ActivityStateKeys } from '../rules/ActivityStateKeys'

export class ActivityConfigCache {
    static readonly ACTIVITY_CACHE_EXPIRE_TS = 86400 * 45

    private static syncedActivityConfSalt: Map<int, Map<string, string>> = new Map()

    static getConfCacheKey(sId: int, activityName: string, salt: string) {
        return `${ActivityStateKeys.ActivityConf}:${sId}:${activityName}:${salt}`
    }

    static updateActivityConfClass(sId: int, listConf: IConfList, activityConf: string, salt: string) {
        try {
            if (!Config.existScheme(listConf.fromName)) {
                Log.error(
                    '更新活动配置异常!导刷的活动配置映射类不存在!activityName:' +
                        listConf.activityName +
                        ' fromName:' +
                        listConf.fromName,
                )
                return
            }
            const spaceKey = this.getConfSpaceKey(listConf.activityName, salt)
            activityConf = activityConf.trim()
            Config.setActivityConf(
                spaceKey,
                listConf.fromName,
                listConf.activityName,
                activityConf,
                listConf.fromDB > 1,
            )
        } catch (e) {
            throw new Error('更新活动配置异常 activityName:' + listConf.activityName + ' context:' + activityConf + e)
        }

        if (!this.syncedActivityConfSalt.has(sId)) this.syncedActivityConfSalt.set(sId, new Map())
        this.syncedActivityConfSalt.get(sId)!.set(listConf.activityName, salt)
    }

    static async loadConfToStatic(sId: int, name: string, salt: string, activityId: int) {
        const listConf = C.list(name)
        if (!listConf || listConf.fromDB <= 0) return
        if ((this.syncedActivityConfSalt.get(sId)?.get(name) ?? '') === salt) return

        const cacheKey = this.getConfCacheKey(sId, name, salt)
        let activityConf = await RedisInstance.getServerRedis().get(cacheKey)
        if (!activityConf && activityId > 0) {
            const activityModel = await ServerActivityModel.findOne({ where: { id: activityId, sid: sId } })
            activityConf = activityModel?.activityConf ?? ''
        }
        if (!activityConf) return
        this.updateActivityConfClass(sId, listConf, activityConf, salt)
    }

    static getConfSalt(sId: int, activityName: string): string | undefined {
        return this.syncedActivityConfSalt.get(sId)?.get(activityName)
    }

    static getConfSpaceKey(activityName: string, salt: string): string {
        return `${activityName}:${salt}`
    }
}
