import { timestamp } from '@arthropoda/game-engine'
import { ActionActivityOpenReload } from '../../activity/action/ActionActivityOpenReload'
import { ActionServerStop } from '../../gm/action/ActionServerStop'
import { ActionMailLoopSendGlobal } from '../../mail/action/ActionMailLoopSendGlobal'
import { LocalAction } from '../../../runtime/action/LocalAction'
import { ActionSettingTagRefresh } from '../../../runtime/action/S2S/settingTag/ActionSettingTagRefresh'
import { QueuedLocalAction } from '../../../runtime/action/QueuedLocalAction'
import { ServerStatusNotifier } from '../notification/ServerStatusNotifier'
import { ServerSettingDefine } from '../rules/ServerSettingDefine'
import { ServerSettingStore } from './ServerSettingStore'

export class ServerSettingRefresh {
    static readonly TAGS = [
        ServerSettingDefine.TAG_ACTIVITY,
        ServerSettingDefine.TAG_MAIL,
        ServerSettingDefine.TAG_MODULE,
        ServerSettingDefine.TAG_SERVER_STOP,
        ServerSettingDefine.TAG_OPEN_TIME,
        ServerSettingDefine.TAG_FIRST_RECHARGE,
        ServerSettingDefine.TAG_GONGGAO_GAME,
        ServerSettingDefine.TAG_QUESTION,
    ]

    static async refreshAllServerCache(sIdsParam: number[]) {
        const sIds = sIdsParam.length === 0 ? [SERVER_ID] : sIdsParam
        const changedSids = []
        const activityChangedSids = []
        for (const sid of sIds) {
            const changedMap = await this.refreshCache(sid)
            if (Object.keys(changedMap).length > 0) changedSids.push(sid)
            if (changedMap[ServerSettingDefine.TAG_ACTIVITY]) activityChangedSids.push(sid)
        }
        if (changedSids.length > 0) {
            LocalAction.broadcast(ActionSettingTagRefresh, { sIds: changedSids })
        }
        if (activityChangedSids.length > 0) {
            LocalAction.send(ActionActivityOpenReload, { sIds: activityChangedSids }, 0, 0)
        }
    }

    private static async refreshCache(sid: int): Promise<Record<string, boolean>> {
        const oldSettings = await ServerSettingStore.loadAllKeyVal(sid)
        const newSettings = await ServerSettingStore.loadCurrentSettings(sid)
        const now = timestamp()
        const changed: Record<string, boolean> = {}

        for (const tag of this.TAGS) {
            const oldSetting = oldSettings.get(tag)
            const newSetting = newSettings.get(tag)
            if (!newSetting) continue
            if (tag === ServerSettingDefine.TAG_GONGGAO_GAME) {
                newSetting.detail = oldSetting?.detail ?? ''
                newSetting.extVal = oldSetting?.extVal ?? 0
            }
            if (newSetting.sVal === oldSetting?.sVal) continue

            changed[tag] = true
            switch (tag) {
                case ServerSettingDefine.TAG_MAIL:
                    LocalAction.send(ActionMailLoopSendGlobal, { sIds: [] }, 0, 0)
                    break
                case ServerSettingDefine.TAG_SERVER_STOP:
                    if (now >= newSetting.startTime && now < newSetting.endTime) {
                        await ServerStatusNotifier.pushServerStop(sid, newSetting.detail)
                    }
                    if (newSetting.endTime > now) {
                        await QueuedLocalAction.rpc(ActionServerStop, { sIds: [sid] }, 0, sid, newSetting.startTime + 5)
                    }
                    break
            }
        }

        if (Object.keys(changed).length > 0) await ServerSettingStore.replace(sid, newSettings)
        return changed
    }
}
