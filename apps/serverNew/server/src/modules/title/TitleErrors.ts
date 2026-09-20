import { GameError } from '@arthropoda/game-engine'

export class TitleErrors {
    static readonly TitleNotExist = new GameError(12011, '称号不存在')

    static readonly TitleNotOwn = new GameError(12012, '未拥有该称号')

    static readonly TitleRankNotClaimable = new GameError(12013, '该称号由榜单结算发放，无法手动领取')
}
