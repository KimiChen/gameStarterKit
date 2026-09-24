import { Bean } from '@arthropoda/game-engine'

/** 待投递奖励：taskId 是可靠队列的幂等号，结算后按它重复登记不会产生第二封邮件。 */
export class GameDemoRewardBean extends Bean {
    uid: int = 0
    gold: int = 0
    title: string = ''
    source: string = ''
}
