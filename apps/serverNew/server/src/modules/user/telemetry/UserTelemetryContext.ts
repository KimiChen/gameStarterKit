import { E_APP_TYPE, UtilObject, UtilTime, timestamp } from '@arthropoda/game-engine'
import { TaCommonUser } from '../../../../generated/telemetry/models/TaCommonUser'
import { TaUserData } from '../../../../generated/telemetry/models/TaUserData'
import { TelemetryBatchState } from '../../../telemetry/TelemetryBatchState'
import { TelemetryEventFormatter } from '../../../telemetry/TelemetryEventFormatter'
import { TelemetryEventWriter } from '../../../telemetry/TelemetryEventWriter'
import { TelemetryPropertiesRegistry } from '../../../telemetry/TelemetryPropertiesRegistry'
import type { User } from '../bean/User'

export class UserTelemetryContext {
    static record(properties: { [key: string]: any }, user?: User) {
        try {
            const publicProperties = this.publicProperties(user)
            const eventData = TelemetryEventFormatter.format(properties, publicProperties)
            const eventName = UtilObject.getValue(properties, 'EVENT_NAME')
            if (!Ctx.ta.trackItems[eventName]) {
                Ctx.ta.trackItems[eventName] = []
            }
            Ctx.ta.trackItems[eventName].push(eventData)
        } catch (error) {
            Log.error('数数埋点错误', error, properties)
        }
    }

    static track(properties: { [key: string]: any }, user?: User, distinctId: string = '') {
        if (!TelemetryEventWriter.isEnabled()) {
            return false
        }

        try {
            const publicProperties = this.publicProperties(user)
            const eventData = TelemetryEventFormatter.format(properties, publicProperties)
            if (user) {
                return new TelemetryEventWriter().track(
                    publicProperties.account_id,
                    properties.EVENT_NAME,
                    eventData,
                    {},
                    distinctId,
                )
            }

            eventData.open_id = distinctId
            return new TelemetryEventWriter().track(distinctId, properties.EVENT_NAME, eventData)
        } catch (error) {
            Log.error('数数上报错误', error)
            return false
        }
    }

    static reloadPublicProperties(user: User, userTaVersion = 0): TaCommonUser {
        const properties = new TaCommonUser()
        Object.assign(properties, TelemetryPropertiesRegistry.collect(user))
        properties.taVersion = userTaVersion
        return properties
    }

    static publicProperties(user?: User): TaCommonUser {
        let properties: TaCommonUser
        if (APP_TYPE === E_APP_TYPE.SERVICE && user) {
            const userId = user.id
            const userTaVersion = user.taVersion ?? 0
            properties = TelemetryBatchState.taCommonUsers[userId]
            if (!properties || userTaVersion > properties.taVersion) {
                properties = this.reloadPublicProperties(user, userTaVersion)
                TelemetryBatchState.taCommonUsers[userId] = properties
            }
            properties.event_time = timestamp()
        } else if (user) {
            const userId = user.id
            properties = TelemetryBatchState.taCommonUsers[userId]
            if (!properties) {
                properties = this.reloadPublicProperties(user)
                TelemetryBatchState.taCommonUsers[userId] = properties
            }
            properties.event_time = timestamp()
        } else {
            properties = new TaCommonUser()
            properties.event_time = timestamp()
        }

        return properties
    }

    static gameCountKey(userId: int, time: int) {
        return 'HUGameCount_' + UtilTime.formatYMD(time) + '_' + userId
    }

    static updateUserProperties(accountId: string, properties: { [key: string]: any }) {
        if (accountId == '') {
            return false
        }
        if (!properties) {
            return false
        }

        if (!Ctx.ta.addProperties[accountId]) {
            Ctx.ta.addProperties[accountId] = []
        }

        outerLoop: for (const name in properties) {
            let value = properties[name]
            if (!TaUserData.DATA_FORMAT[name]) {
                continue
            }

            switch (TaUserData.DATA_FORMAT[name]) {
                case 'int':
                case 'number':
                    value = Number(value)
                    break
                case 'string':
                    value = String(value)
                    break
                case 'bool':
                case 'boolean':
                    value = Boolean(value)
                    break
                case 'datetime':
                    if (!isNaN(parseFloat(value))) {
                        value = UtilTime.formatYmdHis(value)
                    }
                    break
                default:
                    continue
            }

            switch (TaUserData.METHOD[name]) {
                case 'user_Set':
                    if (!Ctx.ta.setProperties[accountId]) {
                        Ctx.ta.setProperties[accountId] = {}
                    }
                    Ctx.ta.setProperties[accountId][name] = value
                    break
                case 'user_setOnce':
                    if (Ctx.ta.setOnceProperties[accountId] && Ctx.ta.setOnceProperties[accountId][name]) {
                        continue outerLoop
                    }
                    if (!Ctx.ta.setOnceProperties[accountId]) {
                        Ctx.ta.setOnceProperties[accountId] = {}
                    }
                    Ctx.ta.setOnceProperties[accountId][name] = value
                    break
                case 'user_Add':
                    if (!Ctx.ta.addProperties[accountId] || Ctx.ta.addProperties[accountId][name]) {
                        if (!Ctx.ta.addProperties[accountId]) {
                            Ctx.ta.addProperties[accountId] = {}
                        }
                        Ctx.ta.addProperties[accountId][name] = value
                    } else {
                        Ctx.ta.addProperties[accountId][name] += value
                    }
                    break
            }
        }
        return true
    }
}
