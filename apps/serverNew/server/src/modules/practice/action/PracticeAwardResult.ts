import { AwardResponse } from '../../../runtime/protocol/C2S/commom'

/** 修炼结算向调用方返回的奖励容器。 */
export interface PracticeAwardResult {
    award: AwardResponse
}
