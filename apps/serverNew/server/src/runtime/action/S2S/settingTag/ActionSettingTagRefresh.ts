import { ReqSettingTagRefresh } from '../../../protocol/S2S/settingTag'
import { ResDefault } from '../../../protocol/S2S/default'
import { GameAction } from '../../GameAction'
import { ServerSettingStore } from '../../../../modules/serverSettings/runtime/ServerSettingStore'

export class ActionSettingTagRefresh extends GameAction {
    async doAction(req: ReqSettingTagRefresh, res: ResDefault) {
        for (const sId of req.sIds) {
            ServerSettingStore.unsetSidSettingValues(sId)
        }
    }
}
