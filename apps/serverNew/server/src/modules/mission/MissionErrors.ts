import { GameError } from '@arthropoda/game-engine'

export class MissionErrors {
    static readonly MissionOverBuyNum = new GameError(180001, '已达购买上限')

    static readonly MissionNotUnlock = new GameError(180002, '未达到解锁条件')
}
