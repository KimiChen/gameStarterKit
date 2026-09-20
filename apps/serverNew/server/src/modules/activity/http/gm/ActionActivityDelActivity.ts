import { datetotime, timestamp } from '@arthropoda/game-engine'
import { Activity } from './Activity'
import { DB } from '@arthropoda/game-engine'
import { ServerActivityModel } from '../../../../../generated/persistence/ServerActivityModel'
import { ServerActivityProxy } from '../../persistence/ServerActivityProxy'
import { CenterActivityModel } from '../../../../../generated/persistence/CenterActivityModel'
import { CenterActivityProxy } from '../../persistence/CenterActivityProxy'
import { ServerListModel } from '../../../../../generated/persistence/ServerListModel'
import { ServerSettingProxy } from '../../../serverSettings/persistence/ServerSettingProxy'
import { GmAction } from '../../../gm/http/GmAction'
import { QueuedLocalAction } from '../../../../runtime/action/QueuedLocalAction'
import { ActionActivityOpenReload } from '../../action/ActionActivityOpenReload'

/**
 * GM_Activity_delActivity
 * 删除，只能删除未开始的活动
 * @author yangjc
 * @since  2020/10/27 17:45
 */
export class ActionActivityDelActivity extends Activity {
    public async doAction(params: ReqData) {
        return DB.startTransaction(async (runner) => {
            const returnData = []
            if (!params.list) {
                this.gmContext.setGmMsg(1001, '参数错误', params)
                return false
            }
            const sIds = []
            const now = timestamp()
            for (const l of Object.values(params.list)) {
                const sIdParam = l.server_id
                const acId = l.activity_id
                const one = await ServerActivityProxy.getById(sIdParam, acId)
                if (!one) {
                    await runner.rollbackTransaction()
                    this.gmContext.setGmMsg(
                        1003,
                        ` 'activity_id': ${acId}, 'server_id': ${sIdParam}, 'msg': '活动不存在' `,
                        params,
                    )
                    return false
                }

                let serverIds = [sIdParam]
                if (one.crossId != 0) {
                    const cross_activity = await CenterActivityModel.findOneBy({ id: one.crossId })
                    if (!cross_activity) {
                        await runner.rollbackTransaction()
                        this.gmContext.setGmMsg(
                            1004,
                            ` 'activity_id': ${acId}, 'server_id': ${sIdParam}, 'msg': '活动不存在' `,
                            params,
                        )
                        return false
                    }
                    await CenterActivityProxy.updateById(one.crossId, { status: Activity.STATUS_DEL }, runner)
                    serverIds = cross_activity.serverId.split(',').map((el: string) => Number(el))
                }
                for (const sId of serverIds) {
                    let activity: ServerActivityModel | null | undefined
                    if (one.crossId != 0) {
                        activity = await ServerActivityProxy.getByCrossId(sId, one.crossId)
                    } else {
                        activity = one
                    }
                    if (!activity) {
                        continue
                    }

                    const server = (await ServerListModel.findOneBy({ sId: sId }))!
                    // 活动已开启 并且区服已开 不能删除
                    if (activity.openTs <= now && datetotime(server.sTime) <= timestamp()) {
                        await runner.rollbackTransaction()
                        this.gmContext.setGmMsg(
                            1004,
                            ` 'activity_id': ${acId}, 'server_id': ${sId}, 'msg': '活动已开始' `,
                            params,
                        )
                        return false
                    }
                    await ServerActivityProxy.updateById(sId, activity.id, { status: Activity.STATUS_DEL }, runner)
                    returnData.push({ activity_id: activity.id, server_id: sId, state: 1, msg: '' })
                    sIds[sId] = sId
                }
            }
            await runner.commitTransaction()
            await ServerSettingProxy.updateServerSetting(GmAction.ACTIVITY_TAG, sIds)
            // 通知区服立马重新加载配置
            await QueuedLocalAction.rpc(ActionActivityOpenReload, { sIds: sIds }, 0, 0)
            return returnData
        })
    }
}

type ReqData = { list: Record<string, { activity_id: number; server_id: number }> }
