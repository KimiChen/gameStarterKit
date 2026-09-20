import { ServerMaintainDefine } from '../../rules/ServerMaintainDefine'
import { timestamp } from '@arthropoda/game-engine'
import { ServerListModel } from '../../../../../generated/persistence/ServerListModel'
import { GmAction } from '../../../gm/http/GmAction'
import { In } from '@arthropoda/typeorm'
import { ServerListProxy } from '../../persistence/ServerListProxy'

export abstract class Server extends GmAction {
    static readonly STATE_NEW = 1 // 推荐

    static readonly STATE_HOT = 2 // 火爆

    static readonly OPEN_STATUS_CLOSE = 1 // 关闭

    static readonly OPEN_STATUS_OPEN = 2 // 开启

    static readonly BASE_PEOPLE_NUM = 1000 // 最小1000人才能开区

    async handleMaintain(sIds: int[], startTime: int, endTime: int) {
        const checkArr = await this.checkMaintainAction(sIds)
        let action = checkArr[0]
        const beforeStart = checkArr[1]
        if (action == ServerMaintainDefine.ACTION_INVALID) {
            return false
        }
        const nowTime = timestamp()
        let maintainStart = 0
        let maintainEnd = 0
        if (startTime > 0 && endTime > 0) {
            // 定时维护操作类型
            if (action == ServerMaintainDefine.ACTION_MODIFY && startTime != beforeStart) {
                this.gmContext.setGmMsg(2102, '与上次时间维护时间不一致', [action, startTime, beforeStart])
                return false
            } else if (action != ServerMaintainDefine.ACTION_MODIFY && startTime < nowTime) {
                this.gmContext.setGmMsg(2100, '开始时间不能小于当前时间', [action, startTime, beforeStart])
                return false
            }
            maintainStart = startTime
            maintainEnd = endTime
        } else if (endTime > 0) {
            // 立即维护操作类型
            maintainStart = action == ServerMaintainDefine.ACTION_ADD ? nowTime : beforeStart
            maintainEnd = endTime
        } else {
            // 取消维护操作
            if (action == ServerMaintainDefine.ACTION_ADD) {
                this.gmContext.setGmMsg(2103, '未找到维护中的区服')
                return false
            }
            action = ServerMaintainDefine.ACTION_DEL

            maintainStart = Math.min(beforeStart, nowTime)
            maintainEnd = nowTime
        }
        const res = await ServerListModel.update(
            { sId: In([...sIds]) },
            { sMaintainStart: maintainStart, sMaintainEnd: maintainEnd },
        )
        if (!res) {
            this.gmContext.setGmMsg(2104, '数据存储失败')
            return false
        }

        // TODO QueueActionFactory  通知notice要做什么事情

        return true
    }

    async checkMaintainAction(sIds: int[]) {
        const l = await this.getServerItemsByIds(sIds)
        if (l.length == 0) {
            this.gmContext.setGmMsg(2201, '参数请求异常')
            return [ServerMaintainDefine.ACTION_INVALID, 0]
        }

        // 修改维护结束时间
        const beforeStartTs = []
        const beforeEndTs = []

        for (const serverItem of l) {
            beforeStartTs.push(serverItem.sMaintainStart)
            beforeEndTs.push(serverItem.sMaintainEnd)
        }
        const nowTime = timestamp()
        // TODO  这部分代码没有看懂
        if (beforeStartTs.length > 1 || beforeEndTs.length > 1) {
            if (Math.max(...beforeEndTs) > nowTime) {
                this.gmContext.setGmMsg(2202, '存在不同状态的维护信息，不允许操作', [
                    Math.max(...beforeEndTs),
                    beforeEndTs,
                    nowTime,
                ])
                return [ServerMaintainDefine.ACTION_INVALID, 0]
            }
            return [ServerMaintainDefine.ACTION_ADD, nowTime]
        } else if (beforeEndTs.length > 0) {
            const endTime = beforeEndTs.pop()!
            const startTime = beforeStartTs.pop()!

            return [endTime > nowTime ? ServerMaintainDefine.ACTION_MODIFY : ServerMaintainDefine.ACTION_ADD, startTime]
        }
        return [ServerMaintainDefine.ACTION_ADD, nowTime]
    }

    public updateServerByIds(sIds: number[], updateFields: Partial<ServerListModel>) {
        if (Object.keys(updateFields).length == 0) {
            return true
        }

        return ServerListProxy.updateBySids(sIds, updateFields)
    }
}
