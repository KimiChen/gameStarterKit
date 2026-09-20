import { ActionChangeServerState } from '../../../gm/action/ActionChangeServerState'
import { ServerListModel } from '../../../../../generated/persistence/ServerListModel'
import { ServerSettingProxy } from '../../persistence/ServerSettingProxy'
import { QueuedLocalAction } from '../../../../runtime/action/QueuedLocalAction'
import { GmAction } from '../../../gm/http/GmAction'
import { Server } from './Server'

export class ActionServerEndProtect extends Server {
    /**
     * endProtect
     * 结束维护区服
     * @param $params
     * @access
     * @return array|bool
     */
    public async doAction(params: { server_id: string }) {
        const sIds = params.server_id.split(',').map((el) => Int(el))

        const serverItems = await this.getServerItemsByIds(sIds)
        if (!this.checkSidsValid(sIds, serverItems)) {
            return false
        }

        const updateFields: Partial<ServerListModel> = {}
        updateFields.sMaintainStart = 0
        updateFields.sMaintainEnd = 0

        if (!this.updateServerByIds(sIds, updateFields)) {
            this.gmContext.setGmMsg(2004, '数据存储失败')
            return false
        }

        await ServerSettingProxy.updateServerSetting(GmAction.SERVER_STOP, sIds)
        await QueuedLocalAction.rpc(ActionChangeServerState, { sIds: sIds }, 0, 0)

        return { success: 1 }
    }
}
