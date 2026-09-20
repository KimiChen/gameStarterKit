import { ReqPracticeNpcAssist, ResPracticeNpcAssist } from '../PracticeC2S'
import { Award } from '../../props/award/Award'
import { PropItem } from '../../../runtime/protocol/C2S/commom'
import { PracticeNpcSkinBean } from '../bean/PracticeNpcSkinBean'
import { Props } from '../../props/inventory/Props'
import { Map2Array } from '@arthropoda/game-engine'
import { GameAction } from '../../../runtime/action/GameAction'

/**
 * npc领取额外攻击次数
 */
export class ActionPracticeNpcAssist extends GameAction {
    async doAction(req: ReqPracticeNpcAssist, res: ResPracticeNpcAssist) {
        const user = this.user
        const awards: Map<int, PropItem> = new Map<int, PropItem>()
        user.practice.practiceNpcSkins.forEach((npcSkin) => {
            if (npcSkin.isAward) {
                return
            }
            // 读表取奖励
            const skinConf = C.sterious_man_skin(npcSkin.id)
            Award.mergeAwards(awards, skinConf.award)
            // 修改领取状态
            if (!user.practice.practiceNpcSkins.has(npcSkin.id)) {
                user.practice.practiceNpcSkins.set(npcSkin.id, new PracticeNpcSkinBean({ id: npcSkin.id }))
            }
            user.practice.practiceNpcSkins.get(npcSkin.id)!.isAward = true
        })

        await Props.addProps(user, Map2Array(awards)!, res.award)
        return
    }
}
