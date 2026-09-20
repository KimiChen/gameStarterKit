import { RedisInstance } from '@arthropoda/game-engine'
import { ModuleConfModel } from '../../../../generated/persistence/ModuleConfModel'
import { ServerListModel } from '../../../../generated/persistence/ServerListModel'
import { ServerSettingModel } from '../../../../generated/persistence/ServerSettingModel'
import { ServerSettingDefine } from '../rules/ServerSettingDefine'
import { ServerSettingsKeys } from '../rules/ServerSettingsKeys'

export interface SettingModel {
    sKey: string
    sVal: int
    startTime: int
    endTime: int
    detail: string
    extVal: int
}

export class ServerSettingStore {
    static readonly MODULE_STATUS_OFF = 2

    static readonly MODULE_STATUS_OPEN = 1

    private static settingMap: Map<int, Map<string, SettingModel>> = new Map()

    static async replace(sid: number, newSettings: Map<string, SettingModel>) {
        this.settingMap.set(sid, newSettings)
        const values: Record<string, SettingModel> = {}
        newSettings.forEach((setting) => {
            values[setting.sKey] = setting
        })
        await RedisInstance.getCenterRedis().hSet(
            ServerSettingsKeys.CACHE_SETTING_MANAGER_VALUES,
            sid,
            JSON.stringify(values),
        )
    }

    static async loadAllKeyVal(sid: number): Promise<Map<string, SettingModel>> {
        const result = await RedisInstance.getCenterRedis().hGet(
            ServerSettingsKeys.CACHE_SETTING_MANAGER_VALUES,
            String(sid),
        )
        if (!result) return new Map()

        const values: Record<string, SettingModel> = JSON.parse(result)
        const settings = new Map<string, SettingModel>()
        for (const key in values) settings.set(key, values[key])
        return settings
    }

    private static async recoverySettingMap(sid: number) {
        this.settingMap.set(sid, await this.loadAllKeyVal(sid))
    }

    static async loadSettingValue(sid: number, key: string): Promise<int> {
        return (await this.loadSetting(sid, key))?.sVal ?? 0
    }

    static async loadSetting(sid: number, key: string): Promise<SettingModel | undefined> {
        if (!this.settingMap.has(sid)) await this.recoverySettingMap(sid)
        return this.settingMap.get(sid)?.get(key)
    }

    static unsetSidSettingValues(sid: number): void {
        this.settingMap.delete(sid)
    }

    static async loadCurrentSettings(sid: int) {
        const settingsByKey: Map<string, SettingModel> = new Map()
        const settings = await ServerSettingModel.find({ where: [{ sId: sid }] })
        for (const setting of settings ?? []) {
            settingsByKey.set(setting.sKey, {
                sKey: setting.sKey,
                sVal: setting.sVal,
                startTime: setting.startTime,
                endTime: setting.endTime,
                detail: setting.detail,
                extVal: 0,
            })
        }

        const openTime = defaultSettingModel(ServerSettingDefine.TAG_OPEN_TIME)
        settingsByKey.set(ServerSettingDefine.TAG_OPEN_TIME, openTime)
        const firstRechargeReset = defaultSettingModel(ServerSettingDefine.TAG_FIRST_RECHARGE)
        settingsByKey.set(ServerSettingDefine.TAG_FIRST_RECHARGE, firstRechargeReset)

        const server = await ServerListModel.findOne({ where: { sId: sid } })
        if (server) {
            openTime.sVal = server.sTime.getTime() / 1000
            firstRechargeReset.sVal = server.sRechargeResettime
            const serverStop =
                settingsByKey.get(ServerSettingDefine.TAG_SERVER_STOP) ??
                defaultSettingModel(ServerSettingDefine.TAG_SERVER_STOP)
            serverStop.startTime = server.sMaintainStart
            serverStop.endTime = server.sMaintainEnd
            settingsByKey.set(ServerSettingDefine.TAG_SERVER_STOP, serverStop)
        }

        if (settingsByKey.has(ServerSettingDefine.TAG_MODULE)) {
            settingsByKey.get(ServerSettingDefine.TAG_MODULE)!.extVal = await this.loadModuleOnOffFromDb(sid)
        }
        return settingsByKey
    }

    static async loadModuleOnOffFromDb(sid: int) {
        const moduleConfs = await ModuleConfModel.find({ where: { sid } })
        let value = 0
        for (const moduleConf of moduleConfs) {
            if (moduleConf.status === this.MODULE_STATUS_OFF && moduleConf.type > 0) {
                value += Math.pow(2, moduleConf.type)
            }
        }
        return value
    }
}

function defaultSettingModel(key: string): SettingModel {
    return { sKey: key, sVal: 0, startTime: 0, endTime: 0, detail: '', extVal: 0 }
}
