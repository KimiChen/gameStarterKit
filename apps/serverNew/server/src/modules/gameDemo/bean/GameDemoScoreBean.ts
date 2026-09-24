import { Bean } from '@arthropoda/game-engine'

/** 活动积分：同分按先达到的顺序（sequence）排名。 */
export class GameDemoScoreBean extends Bean {
    uid: int = 0
    score: int = 0
    sequence: int = 0
}
