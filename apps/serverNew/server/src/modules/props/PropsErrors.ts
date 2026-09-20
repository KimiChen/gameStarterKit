import { GameError } from '@arthropoda/game-engine'

export class PropsErrors {
    static readonly PropsLvLimit = new GameError(8001, '玩家等级不足！')

    static readonly PropsNoUse = new GameError(8002, '该物品无法使用！')

    static readonly PropsUseMax = new GameError(8004, '超出最大使用数量限制！')

    static readonly PropsNoImpl = new GameError(8005, '未实现的道具类型！')

    static readonly PropsMaxLimit = new GameError(8006, '超出拥有数量限制！')

    static readonly PropsNoHave = new GameError(8007, '未拥有该物品！')

    static readonly PropNoEnough = new GameError(8008, '道具不足')

    static readonly GeneralPropNotAvailable = new GameError(33001, '该时段不可使用该道具')
}
