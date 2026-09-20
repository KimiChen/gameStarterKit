import { datetotime, strtotime, timestamp } from '@arthropoda/game-engine'
import { Server } from './Server'
import { ServerListModel } from '../../../../../generated/persistence/ServerListModel'
import { ServerSettingProxy } from '../../persistence/ServerSettingProxy'
import { GmAction } from '../../../gm/http/GmAction'
import { QueuedLocalAction } from '../../../../runtime/action/QueuedLocalAction'
import { ActionChangeServerState } from '../../../gm/action/ActionChangeServerState'
import { ServerListConfigProxy } from '../../persistence/ServerListConfigProxy'

export class ActionServerChangeState extends Server {
    /**
     * changeState
     * 改变区服状态
     * @param $params
     * @access
     * @return array|bool
     */
    public async doAction(params: IReq) {
        const sIds = params.server_id.split(',').map((el) => Int(el))
        const state = Int(params.state) ?? 0
        const pStartTime: string = params.start_time ?? ''
        const pEndTime: string = params.end_time ?? ''

        const serverItems = await this.getServerItemsByIds(sIds)
        if (!this.checkSidsValid(sIds, serverItems)) {
            return false
        }

        const now = timestamp()

        const updateFields: Partial<ServerListModel> = {}
        let isMaintain = false
        if (pStartTime.length > 0 && pEndTime.length > 0) {
            // 定时维护
            const startTime = strtotime(pStartTime)
            const endTime = strtotime(pEndTime)
            if (endTime < now) {
                this.gmContext.setGmMsg(2002, '开始时间需大于确定时间')
                return false
            }
            updateFields.sMaintainStart = startTime
            updateFields.sMaintainEnd = endTime
            isMaintain = true
        } else if (pEndTime.length > 0) {
            // 立即维护
            const endTime = strtotime(pEndTime)
            if (endTime < now) {
                this.gmContext.setGmMsg(2003, '结束时间设置不正确')
                return false
            }
            updateFields.sMaintainStart = 1
            updateFields.sMaintainEnd = endTime
            isMaintain = true
        } else if (state > 0) {
            // 修改区服状态
            if (!(await this.changeServerState(state, sIds, serverItems))) {
                return false
            }
        } else if (Object.hasOwn(params, 'start_time') && Object.hasOwn(params, 'end_time')) {
            // 取消维护状态
            updateFields.sMaintainStart = 0
            updateFields.sMaintainEnd = 0
            isMaintain = true
        } else {
            this.gmContext.setGmMsg(2004, '参数请求异常')
            return false
        }

        if (Object.keys(updateFields).length > 0) {
            if (!this.updateServerByIds(sIds, updateFields)) {
                this.gmContext.setGmMsg(2005, '数据存储失败')
                return false
            }
        }

        if (isMaintain) {
            await ServerSettingProxy.updateServerSetting(GmAction.SERVER_STOP, sIds)
            await QueuedLocalAction.rpc(ActionChangeServerState, { sIds: sIds }, 0, 0)
        }

        return { success: 1 }
    }

    /**
     * changeServerState
     * @access
     * @param $state
     * @param $sIds
     * @param $serverItems
     * @return bool
     */
    private async changeServerState(state: number, sIds: number[], serverItems: Record<number, ServerListModel>) {
        const configObj = await ServerListConfigProxy.getObj()
        if (!configObj) {
            this.gmContext.setGmMsg(2006, 'ServerListConfig数据异常，不能设置状态')
            return false
        }
        if (configObj.intervalStartTime > 0) {
            this.gmContext.setGmMsg(2006, '当前有自动切换任务, 不能设置状态')
            return false
        }
        if (state == Server.STATE_HOT) {
            configObj.recommendId = 0
            configObj.recommendTime = 0
            await configObj.save()
            return true
        } else if (state == Server.STATE_NEW) {
            const sId = sIds[0]
            const serverItem = serverItems[sId]
            const now = timestamp()
            if (!serverItem || datetotime(serverItem.sTime) > now) {
                this.gmContext.setGmMsg(2006, '当前区服id不正确, 不能设置状态')
                return false
            }
            configObj.recommendId = sId
            configObj.recommendTime = timestamp()
            await configObj.save()
            return true
        }

        return false
    }
}

interface IReq {
    start_time: string
    end_time: string
    server_id: string
    state: string
}
