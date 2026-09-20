import { GameError } from '@arthropoda/game-engine'

export class ActivityErrors {
    static readonly ActivityIsEnd = new GameError(3001, '活动已结束')

    static readonly ActivityNumNotEnough = new GameError(3002, '次数不足')

    static readonly ActivityNotOpen = new GameError(3003, '活动暂未开启')

    static readonly ActivityHasAward = new GameError(3004, '奖励已领取')

    static readonly ActivityNotAward = new GameError(3010, '尚未到达领奖时间')

    static readonly ActivityCanNotAward = new GameError(3011, '活动条件不符合')

    static readonly ActivityNotExist = new GameError(3013, '活动不存在')

    static readonly ActivityLessCondition = new GameError(3018, '不满足领取条件')

    static readonly ActivityHadBuy = new GameError(3019, '道具已购买')

    static readonly ActivityNotUnlock = new GameError(3020, '未达到解锁条件')
}
