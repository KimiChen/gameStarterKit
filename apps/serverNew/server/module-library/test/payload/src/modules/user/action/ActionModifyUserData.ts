import { ReqModifyUserData } from '../UserC2S'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { GameAction } from '../../../runtime/action/GameAction'
import { TaskType } from '../../test/TestC2S'
import { HeroBean } from '../../test/bean/HeroBean'
import { RedDotBean } from '../../reddot/bean/RedDotBean'

/**
 * 修改玩家数据
 */
export class ActionModifyUserData extends GameAction {
    async doAction(req: ReqModifyUserData, res: ResDefault) {
        const userBase = this.user
        switch (req.tp) {
            case TaskType.kHero: {
                if (userBase.hero === undefined) {
                    userBase.hero = new HeroBean({ hId: 1002, lv: 1 })
                } else {
                    userBase.hero.lv += 1
                }
                break
            }
            case TaskType.kGc: {
                userBase.gc += 100
                break
            }
            case TaskType.kRedDot: {
                if (userBase.redDot.size() < 1) {
                    userBase.redDot.set('red', new RedDotBean({ state: 11, type: 'red' }))
                } else {
                    userBase.redDot.delete('red')
                }
                break
            }
        }
    }
}
