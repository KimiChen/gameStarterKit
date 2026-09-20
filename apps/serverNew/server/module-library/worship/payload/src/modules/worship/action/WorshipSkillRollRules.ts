import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { User } from '../../user/bean/User'
import { WorshipSkillBean } from '../bean/WorshipSkillBean'
import { StatDefine } from '../rules/StatDefine'

/**
 * 供奉系统
 */
export class WorshipSkillRollRules {
    /** 坑位id范围  */
    static readonly SlotRange = [1, 4]

    /**
     * 重组奖池
     * @param qualityRange
     * @returns
     */
    static getPool(qualityRange: [min: int, max: int]) {
        const [minQuality, maxQuality] = qualityRange
        const skills = []
        const confs = C.worship_skill()
        for (const conf of confs.values()) {
            if (conf.quality < minQuality) {
                continue
            }
            if (conf.quality > maxQuality) {
                continue
            }
            skills.push(conf)
        }
        return skills
    }

    /**
     * 获取品质区间
     * @param user
     * @returns
     */
    static getQualityRange(user: User): [min: int, max: int] {
        // 保底品质
        const smallBaseQuality = Param.WorshipSkillMaxTime2[0]
        const bigBaseQuality = Param.WorshipSkillMaxTime1[0]

        // 保底次数
        const smallBaseNum = Param.WorshipSkillMaxTime2[1]
        const bingBaseNum = Param.WorshipSkillMaxTime1[1]

        // 最少抽取次数
        const smallMinNum = Param.WorshipSkillMaxTime2[2]
        const bingMinNum = Param.WorshipSkillMaxTime1[2]

        // 默认的品质区间
        let minQuality = StatDefine.QUALITY_WHITE
        let maxQuality = StatDefine.QUALITY_RED

        // 计算最大品质 及 最小品质
        if (user.worship.bigBase < bingMinNum) {
            maxQuality = bigBaseQuality - 1
        }

        if (user.worship.smallBase < smallMinNum) {
            maxQuality = smallBaseQuality
        }

        if (user.worship.smallBase >= smallBaseNum) {
            minQuality = smallBaseQuality
        }

        if (user.worship.bigBase >= bingBaseNum) {
            minQuality = bigBaseQuality
        }

        return [minQuality, maxQuality]
    }

    /**
     * 获取供奉技能
     * @param user
     * @param slotId
     * @returns
     */
    static getWorshipSkillItem(user: User, slotId: int) {
        if (slotId > this.SlotRange[1] || slotId < this.SlotRange[0]) {
            throw SystemErrors.SysParamError
        }
        let item = user.worship.skills.get(slotId)
        if (item == null) {
            item = new WorshipSkillBean({ id: slotId })
            user.worship.skills.set(slotId, item)
        }
        return item
    }
}
