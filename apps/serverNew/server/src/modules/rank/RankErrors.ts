import { GameError } from '@arthropoda/game-engine'

export class RankErrors {
    static readonly RankAlreadyWorship = new GameError(6001, '已经膜拜')

    static readonly RankNoData = new GameError(6002, '没有玩家上榜，无法膜拜')

    static readonly RankNoFount = new GameError(6003, '该排行榜不存在')
}
