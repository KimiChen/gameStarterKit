import { Bean, DiffMap } from '@arthropoda/game-engine'
import { WorshipSkillBean } from './WorshipSkillBean'

/**
 * 供奉系统
 */
export class UserWorshipBean extends Bean {
    /**
     * 供奉-大保底次数
     */
    bigBase: int = 0

    /**
     * 供奉-小保底次数
     */
    smallBase: int = 0

    /**
     * 供奉技能
     */
    skills?: DiffMap<int, WorshipSkillBean>
}
