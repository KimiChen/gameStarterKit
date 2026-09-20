import { Bean } from '@arthropoda/game-engine'

export class SurveyItem extends Bean {
    /**
     * 问卷ID
     */
    id: int = 0

    /**
     * 状态，0未完成,1可领取,2已领取
     */
    state: int = 0
}
