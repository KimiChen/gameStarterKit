import { Bean } from '@arthropoda/game-engine'

export class WorshipSkillBean extends Bean {
    /**
     * 坑位id
     */
    id: int = 0

    /**
     * 技能id
     */
    skillId: int = 0

    /**
     * 洗出来的技能id
     */
    newSkillId: int = 0
}
