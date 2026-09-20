import { User } from '../bean/User'
import { UserForbidType } from '../../gm/rules/UserForbidType'
import { UtilTime } from '@arthropoda/game-engine'
import { timestamp } from '@arthropoda/game-engine'
import { ReqUserSync, ResUserSync } from '../UserC2S'
import { GameAction } from '../../../runtime/action/GameAction'
import { UserOnlineMgr } from '@arthropoda/game-engine'
import { CopperIncome } from './CopperIncome'

/**
 * 心跳同步接口
 */
export class ActionUserSync extends GameAction {
    async doAction(req: ReqUserSync, res: ResUserSync) {
        const nowTime = timestamp()

        // 每完整五秒结算一次铜币；不足五秒的时间留到下一次心跳。
        CopperIncome.settleOnline(this.user, nowTime)

        // 累计在线时长
        syncOnlineTime(this.user)

        // 业务模块的同步
        syncEvent(nowTime)

        // 检测封禁是否结束
        checkForbid(this.user)

        // 统计上报
        // StatCenter.heartBeat(this.user)

        // 同步在线状态
        await UserOnlineMgr.updateTime(this.user.sId, this.user.id)

        // 返回当前时间
        res.sc = nowTime
    }
}

/**
 * 检测封禁是否结束
 */
export function checkForbid(user: User) {
    if (user.refuse.size() == 0) {
        return
    }
    const now = timestamp()
    for (const [key, refuse] of user.refuse) {
        if (refuse.endTime <= now && refuse.endTime !== UserForbidType.FORBID_TIME) {
            user.refuse.delete(key)
        }
    }
}

/**
 * 业务模块的同步
 */
export function syncEvent(nowTime: int): void {}

/**
 * 同步在线时长
 * @param HUser user
 */
export function syncOnlineTime(user: User) {
    const now = timestamp()

    // 活跃时长
    const activityTime = now - user.activityTime
    user.totalOnlineTime += activityTime
    user.onlineTime += activityTime

    // 跨天时当天在线时长
    const ts = UtilTime.getDayStartTime(now)
    if (user.activityTime < ts) {
        user.onlineTime = now - ts
    }

    // 更新redis中的活跃时间
    user.activityTime = now
}
