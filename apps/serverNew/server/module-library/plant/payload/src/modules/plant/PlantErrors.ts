import { GameError } from '@arthropoda/game-engine'

export class PlantErrors {
    static readonly PlantCantWake = new GameError(200001, '当前蛤蟆没有摸鱼')

    static readonly PlantNoWakeTimes = new GameError(200002, '唤醒次数不足')

    static readonly PlantNoWaterTimes = new GameError(200003, '浇水次数不足')

    static readonly PlantNotMature = new GameError(200004, '桃子还未成熟')

    static readonly PlantMaxLv = new GameError(200005, '蛤蟆已经满级')

    static readonly PlantAskIsCd = new GameError(200006, '请求过于频繁')

    static readonly PlantNoHelpTimes = new GameError(200007, '协助次数不足')

    static readonly PlantHasWatered = new GameError(200008, '已经给该玩家浇过水')

    static readonly PlantNoHelpedTimes = new GameError(200009, '被协助次数不足')

    static readonly PlantMature = new GameError(200010, '桃子已经成熟了！')

    static readonly PlantNotAsk = new GameError(200011, '对方未发起协助！')

    static readonly PlantNotTimes = new GameError(200012, '领取次数不足！')
}
