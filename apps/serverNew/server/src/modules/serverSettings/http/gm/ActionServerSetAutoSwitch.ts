import { timestamp } from '@arthropoda/game-engine'
import { ServerListConfigProxy } from '../../persistence/ServerListConfigProxy'
import { Server } from './Server'

export class ActionServerSetAutoSwitch extends Server {
    /**
     * setOpen
     * 设置开服时间
     * @param $params
     * @access
     * @return array
     */
    public async doAction(params: { server_id: string; interval_time: string }) {
        let sIds = params.server_id.split(',').map((el) => Int(el))
        const intervalTime = Int(params.interval_time) ?? 0

        const configObj = await ServerListConfigProxy.getObj()
        if (!configObj) {
            this.gmContext.setGmMsg(2005, '配置数据不存在')
            return false
        }

        if (intervalTime > 0) {
            if (configObj.intervalTime > 0) {
                this.gmContext.setGmMsg(2001, '当前有自动切换状态')
                return false
            }
            const serverItems = await this.getServerItemsByIds(sIds)
            if (!this.checkSidsValid(sIds, serverItems)) {
                return false
            }
            if (!this.checkSidsOpen(serverItems)) {
                return false
            }
            if (sIds.length < 2) {
                this.gmContext.setGmMsg(2003, '更改失败，自动切换区服状态任务至少需选择2个区服')
                return false
            }
            if (await this.isWillOpenServer()) {
                this.gmContext.setGmMsg(2004, '更改失败，已设置开区任务，不允许更改状态为定时自动切换状态')
                return false
            }
        } else {
            if (intervalTime < 0) {
                this.gmContext.setGmMsg(2002, '切换时间不正确')
                return false
            }
        }
        if (intervalTime > 0) {
            configObj.intervalTime = intervalTime
            configObj.intervalStartTime = timestamp()
            sIds = sIds.sort()
            configObj.serverId = sIds.join(',')
        } else {
            configObj.intervalTime = intervalTime
            configObj.intervalStartTime = 0
            configObj.serverId = String(0)
        }
        configObj.recommendId = 0
        configObj.recommendTime = 0

        if (!(await configObj.save())) {
            this.gmContext.setGmMsg(2003, '数据存储失败')
            return false
        }

        return { success: 1 }
    }
}
