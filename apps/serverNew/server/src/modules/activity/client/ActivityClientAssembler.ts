import { Config, RedisInstance } from '@arthropoda/game-engine'
import json5 from 'json5'
import { ServerActivityModel } from '../../../../generated/persistence/ServerActivityModel'
import { User } from '../../user/bean/User'
import { Activity } from '../bean/Activity'
import { ActivitySaltItemBean } from '../bean/ActivitySaltItemBean'
import { ActivityConfigCache } from '../config/ActivityConfigCache'
import { ActivityOperatorRegistry } from '../operation/ActivityOperatorRegistry'
import { ActivitySchedule } from '../scheduling/ActivitySchedule'
import { ActivityScheduleResolver } from '../scheduling/ActivityScheduleResolver'
import { ActivityScheduleStore } from '../scheduling/ActivityScheduleStore'

export class ActivityClientAssembler {
    static async getActivityConf(sId: int, listConf: IConfList, schedule: ActivitySchedule, isWhite: boolean) {
        if (!Config.existScheme(listConf.fromName)) return null
        if (listConf.fromDB === 0) return Config.getConfig(listConf.fromName)

        const cacheSalt = ActivityConfigCache.getConfSalt(sId, schedule.name)
        if (schedule.salt && cacheSalt === schedule.salt) {
            const spaceKey = ActivityConfigCache.getConfSpaceKey(listConf.activityName, schedule.salt)
            if (listConf.fromDB > 1) return Config.getConfigBySpace(spaceKey, listConf.fromName)
            return Config.getConfigBySpace(spaceKey, listConf.fromName).get(schedule.name) ?? null
        }

        const cacheKey = ActivityConfigCache.getConfCacheKey(sId, schedule.name, schedule.salt)
        let activityConfData = (await RedisInstance.getServerRedis().get(cacheKey)) ?? ''
        if (!activityConfData && isWhite) {
            const activityModel = await ServerActivityModel.findOne({ where: { sid: sId, id: schedule.id } })
            activityConfData = activityModel?.activityConf ?? ''
        }
        if (activityConfData.length === 0) return listConf.fromDB > 1 ? [] : {}

        const activityConfArr = json5.parse(activityConfData)
        try {
            if (listConf.fromDB > 1) {
                return Config.convertJsonDataToMapData(listConf.fromName, activityConfArr)
            }
            const converted = Config.convertJsonDataToMapData(listConf.fromName, {
                [listConf.activityName]: activityConfArr,
            })
            return converted.get(listConf.activityName)
        } catch (e) {
            throw new Error('更新活动配置异常' + e)
        }
    }

    static async pbFormatActivity(user: User) {
        const activities = await ActivityScheduleResolver.getOpenList(user.sId, user)
        const modInfo = new Activity(user.sId)

        for (const activity of activities) {
            if (!activity.checkIsOpen()) continue
            const activityConf = C.list(activity.name)
            if (activityConf.toList !== '0') {
                const operator = await ActivityOperatorRegistry.getActivityOperator(user.sId, activity.name, user)
                if (!operator?.activityOpenInfo) continue
                await operator.getInfo(user, modInfo)
            }
            modInfo.l.set(activity.name, activity.toActivityMod())
            if (activityConf.fromDB > 0) {
                modInfo.dl.set(activity.name, this.formatModConfSaltItem(activity, activityConf))
            }
        }

        modInfo.activityVersion = await ActivityScheduleStore.loadActivityTimeVer(user.sId)
        return modInfo
    }

    static formatModConfSaltItem(schedule: ActivitySchedule, listConf: IConfList) {
        const saltItem = new ActivitySaltItemBean()
        saltItem.name = schedule.name
        saltItem.id = schedule.id
        saltItem.salt = schedule.salt
        saltItem.configAll = listConf.fromDB !== 1
        saltItem.configName = listConf.fromName
        return saltItem
    }
}
