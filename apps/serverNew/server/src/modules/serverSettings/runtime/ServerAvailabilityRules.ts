import { timestamp } from '@arthropoda/game-engine'
import { ServerSettingDefine } from '../rules/ServerSettingDefine'
import { ServerSettingStore } from './ServerSettingStore'

export class ServerAvailabilityRules {
    static async getOnlySvOpenTime(sId: int): Promise<int> {
        return ServerSettingStore.loadSettingValue(sId, ServerSettingDefine.TAG_OPEN_TIME)
    }

    static async serverIsOpen(sId: int): Promise<boolean> {
        return timestamp() >= (await this.getOnlySvOpenTime(sId))
    }

    static async checkServerStop(sId: number): Promise<boolean> {
        const stopInfo = await ServerSettingStore.loadSetting(sId, ServerSettingDefine.TAG_SERVER_STOP)
        if (!stopInfo?.startTime || !stopInfo.endTime) return false
        const now = timestamp()
        return now > stopInfo.startTime && now < stopInfo.endTime
    }
}
