import { datetotime, timestamp } from '@arthropoda/game-engine'
import { ServerListModel } from '../../../../../generated/persistence/ServerListModel'
import { Activity } from './Activity'
import { ServerActivityModel } from '../../../../../generated/persistence/ServerActivityModel'
import { ServerSettingProxy } from '../../../serverSettings/persistence/ServerSettingProxy'
import { GmAction } from '../../../gm/http/GmAction'

/** 这个方法未经过测试,后台也不清楚什么时候调用 */
export class ActionActivityClearActivity extends Activity {
    public async doAction(params: any) {
        const serverId = Number(params.server_id ?? 0)
        const server = await ServerListModel.findOneBy({ sId: serverId })
        if (!server) {
            this.gmContext.setGmMsg(1003, '区服不存在')
            return false
        }

        // 已经开区的区服不能删除活动
        if (datetotime(server.sTime) <= timestamp()) {
            this.gmContext.setGmMsg(1003, '已经开区的区服不能清理活动')
            return false
        }

        // todo 跨服活动清理
        await ServerActivityModel.update({ sid: serverId }, { status: Activity.STATUS_DEL })
        Log.info('后台清理未开区区服导入的活动：serverId：' + serverId)

        await ServerSettingProxy.updateServerSetting(GmAction.ACTIVITY_TAG, serverId)
        return []
    }
}
