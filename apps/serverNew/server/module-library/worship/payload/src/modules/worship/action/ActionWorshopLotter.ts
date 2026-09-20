import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { GameRandom } from '../../../runtime/random/GameRandom'
import { Props } from '../../props/inventory/Props'
import { ItemIdDefine } from '../../props/rules/ItemIdDefine'
import { ReqWorshopLotter, ResWorshopLotter } from '../WorshipC2S'
import { WorshipSkillRollRules } from './WorshipSkillRollRules'

/**
 * 抽供奉技能
 */
export class ActionWorshopLotter extends GameAction {
    async doAction(req: ReqWorshopLotter, res: ResWorshopLotter) {
        const user = this.user

        const slotId = req.slotId
        const propId = req.propId

        let skillConf

        if (propId > 0) {
            const itemConf = C.item(propId)
            if (itemConf.type !== ItemIdDefine.ITEM_TYPE_WORSHIP) {
                throw SystemErrors.SysParamError
            }

            // 消耗道具
            await Props.costProp(user, propId, 1)
            // 使用道具，指定本次抽奖的品质范围
            const quality = itemConf.value1 as int

            // 随技能
            const skillConfs = C.worship_skill()
            skillConf = GameRandom.randomByWeightConfig(skillConfs.arrayValues())
            if (skillConf == null) {
                throw SystemErrors.SysNoConf
            }

            // 随机到到品质小于保底品质，则重组奖池为保底品质的所有技能
            const pool = []
            if (skillConf.quality < quality) {
                for (const val of skillConfs.values()) {
                    if (val.quality == quality) {
                        pool.push(val)
                    }
                }

                skillConf = GameRandom.randomByWeightConfig(pool)
            }

            if (skillConf == null) {
                throw SystemErrors.SysNoConf
            }
        } else {
            // 消耗道具
            await Props.costProp(user, Param.WorshipSkillcost[0], Param.WorshipSkillcost[1])
            // 抽奖次数
            user.worship.smallBase++
            user.worship.bigBase++

            // 保底逻辑
            const qualityRange = WorshipSkillRollRules.getQualityRange(user)

            // 随技能
            skillConf = GameRandom.randomByWeightConfig(WorshipSkillRollRules.getPool(qualityRange))

            if (skillConf == null) {
                throw SystemErrors.SysNoConf
            }

            // 清空对应品质的保底次数
            if (skillConf.quality === Param.WorshipSkillMaxTime1[0]) {
                user.worship.bigBase = 0
            }

            if (skillConf.quality === Param.WorshipSkillMaxTime2[0]) {
                user.worship.smallBase = 0
            }
        }

        // 保存洗练出的技能id
        const skillId = skillConf.skillId
        const worshipSkillItem = WorshipSkillRollRules.getWorshipSkillItem(user, slotId)
        worshipSkillItem.newSkillId = skillId

        res.skillId = skillId
    }
}
