import { timestamp } from '@arthropoda/game-engine'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { PropBean } from '../../props/bean/PropBean'
import { User } from '../../user/bean/User'
import { ReqPracticeEnterPractice, ResPracticeEnterPractice } from '../PracticeC2S'
import { PracticeBean } from '../bean/PracticeBean'
import { ActionPractice } from './ActionPractice'

/**
 * 进入修炼场景
 */
export class ActionPracticeEnterPractice extends ActionPractice {
    async doAction(req: ReqPracticeEnterPractice, res: ResPracticeEnterPractice) {
        const newPracticeId = req.newPracticeId
        const practiceConf = C.practice(newPracticeId)
        if (practiceConf === undefined) {
            throw SystemErrors.SysParamError
        }
        const user = this.user
        if (user.lv < practiceConf.entLv) {
            throw SystemErrors.SysParamError
        }

        // 记录进入过的地图id
        if (!user.practice.enteredMapIds.has(newPracticeId)) {
            user.practice.enteredMapIds.set(newPracticeId, newPracticeId)
        }

        const practiceItem = ActionPractice.getPracticeItem(user)
        const now = timestamp()

        if (newPracticeId !== user.practice.practiceId) {
            // 切换练功房,再结算一次上一个地图的挂机奖励（不同地图挂机奖励不同）
            ActionPractice.settlement(user)
            // 修改修炼ID和切换时间
            user.practice.practiceId = newPracticeId

            if (practiceItem.killedAwards.size() > 0) {
                // 前一个场景未领取的所有宝箱，领取到NPC身上
                ActionPractice.killedToNpcAwards(user.practice.npcPracticeAwards, practiceItem.killedAwards.copy())
                practiceItem.killedAwards.init(new Map<int, PropBean>())
            }
            // 新修炼房不存在则创建
            ActionPractice.getPracticeItem(user)
        } else {
            // 结算场景挂机时间到收益里
            ActionPractice.settlement(user)
            const time = Math.min(
                now - (user.practice.settledKilledTime ? user.practice.settledKilledTime : now),
                Param.PracticeHangUpMaxTime,
            )
            const killedNum = ActionPractice.getKilledNumByHangUpTime(user, time)

            if (killedNum > 0) {
                const awards = ActionPractice.getKilledAwardsByKilledNum(user, killedNum)
                // 增加杀怪数量
                user.practice.practiceKilledNum += killedNum
                user.practice.settledKilledTime = now
                // 修复波次和怪物数量
                updateWaveMonster(user, killedNum, practiceItem)
                // 结算击杀奖励添加到击杀奖励列表
                ActionPractice.addKilledAwards(user, practiceItem, awards, res)
            }
        }
        // TODO:任务更新
        return
    }
}

function updateWaveMonster(user: User, killedNum: int, curPractice: PracticeBean) {
    if (curPractice.isFinish) {
        return
    }

    if (curPractice.canTurnBoss) {
        return
    }

    const conf = C.practice(user.practice.practiceId).more.get(curPractice.turnId)
    while (killedNum > 0) {
        if (curPractice.monsterNum > killedNum) {
            // 一个波次未完成，直接更新并返回即可
            curPractice.monsterNum -= killedNum
            break
        } else {
            killedNum -= curPractice.monsterNum
            curPractice.monsterNum = conf.monsterNum
            curPractice.waveId++
        }

        if (curPractice.waveId > conf.waveOrder) {
            break
        }
    }
    if (curPractice.waveId <= conf.waveOrder) {
        return
    }
    // 最后一波怪可以直接打完，直接允许打Boss
    curPractice.monsterNum = conf.monsterNum
    curPractice.waveId = conf.waveOrder
    curPractice.canTurnBoss = 1

    // TODO:更新任务进度
}
