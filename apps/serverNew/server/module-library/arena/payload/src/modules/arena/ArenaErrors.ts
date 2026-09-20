import { GameError } from '@arthropoda/game-engine'

export class ArenaErrors {
    static readonly ArenaNotAwardTime = new GameError(190001, '未到领奖时间')

    static readonly ArenaNoAward = new GameError(190002, '无奖励')

    static readonly ArenaAward = new GameError(190003, '已领奖')

    static readonly ArenaNoMatch = new GameError(190004, '找不到匹配信息')

    static readonly ArenaNoOpen = new GameError(190005, '挑战未开放')

    static readonly ArenaInChallenge = new GameError(190006, '正在挑战中')

    static readonly ArenaTimesNoEnough = new GameError(190007, '挑战次数不足')

    static readonly ArenaMatchCd = new GameError(190008, '匹配cd中')
}
