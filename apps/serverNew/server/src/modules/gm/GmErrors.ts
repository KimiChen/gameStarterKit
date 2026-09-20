import { GameError } from '@arthropoda/game-engine'

export class GmErrors {
    static readonly CdkeyExCodeWrong = new GameError(14001, '兑换码无效')

    static readonly CdkeyExCodeAllAward = new GameError(14002, '兑换码总量已经全部发完')

    static readonly CdkeyExCodeNotExist = new GameError(14003, '兑换码格式不正确')

    static readonly CdkeyExCodeAwarded = new GameError(14004, '已经领取完了兑换码奖励')

    static readonly CdkeyExCodeUsed = new GameError(14005, '兑换码已经被使用')

    static readonly CdkeyExCodeNoAward = new GameError(14006, '兑换码没有奖励配置')

    static readonly CdkeyExCodeNoOpen = new GameError(14007, '兑换码暂未开启')

    static readonly CdkeyExCodeResWrong = new GameError(14008, '兑换码验证异常')

    static readonly CdkeyToFast = new GameError(14009, '点击兑换太快了')

    static readonly CdkeyOverdue = new GameError(14010, '兑换码已过期')
}
