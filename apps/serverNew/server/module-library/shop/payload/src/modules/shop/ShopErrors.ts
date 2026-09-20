import { GameError } from '@arthropoda/game-engine'

export class ShopErrors {
    static readonly ShopNoTimes = new GameError(9001, '无购买次数')

    static readonly ShopLevelLimit = new GameError(9002, '等级不满足，无法购买')

    static readonly ShopItemErr = new GameError(9003, '购买的商品不存在')

    static readonly ShopNoDefine = new GameError(9004, '暂无该商店')

    static readonly ShopAbnormal = new GameError(9005, '商品异常')

    static readonly ShopNoRefresh = new GameError(9006, '商店不能刷新')

    static readonly ShopNoRefreshTimes = new GameError(9007, '商店无刷新次数')

    static readonly ShopNoUnlock = new GameError(9008, '商店暂未解锁')
}
