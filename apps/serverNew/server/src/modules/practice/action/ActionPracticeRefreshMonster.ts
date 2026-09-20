import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ActionPractice } from './ActionPractice'
import { timestamp } from '@arthropoda/game-engine'
import { Award } from '../../props/award/Award'
import { ReqPracticeRefreshMonster } from '../PracticeC2S'

/**
 * 怪物刷新
 */
export class ActionPracticeRefreshMonster extends ActionPractice {
    async doAction(req: ReqPracticeRefreshMonster, res: ResDefault) {
        const user = this.user
        const practiceId = user.practice.practiceId
        const practiceConf = C.practice(practiceId)
        // 检查修炼房怪物的刷新时间
        const practiceItem = ActionPractice.getPracticeItem(user)
        const turnConf = practiceConf.more.get(practiceItem.turnId)
        if (turnConf.monsterNum <= 0) {
            return
        }
        // 提前生成击杀奖励
        const awards = ActionPractice.getKilledAwardsByKilledNum(user, turnConf.monsterNum, true)
        if (awards !== undefined) {
            // 添加到预奖励列表
            practiceItem.preAwards.clear()
            Award.mergeAwards(practiceItem.preAwards.copy(), awards)
        }
        // 更新刷新时间，刷新怪物数量
        practiceItem.monsterNum += turnConf.monsterNum
        practiceItem.refreshTime = timestamp()

        if (practiceItem.waveId < turnConf.waveOrder) {
            practiceItem.waveId++
        }
        return
    }
}
