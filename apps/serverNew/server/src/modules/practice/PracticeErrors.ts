import { GameError } from '@arthropoda/game-engine'

export class PracticeErrors {
    static readonly PracticeRefreshError = new GameError(22001, '练功房刷新怪物异常')

    static readonly PracticeFastNoTimes = new GameError(22002, '快速挂机次数不够')

    static readonly PracticeLvLimit = new GameError(22003, '玩家等级限制，请先提升玩家等级')

    static readonly PracticeAwardTimeErr = new GameError(22004, '领取时间不对')

    static readonly PracticeAwardPowerFull = new GameError(22005, '当前精力已达上限，无法领取')

    static readonly PracticeKilledBoss = new GameError(22006, '当前boss关卡已通过')

    static readonly PracticeChallengeBoss = new GameError(22007, '未达到挑战boss条件')

    static readonly PracticeKillNumErr = new GameError(22008, '快速挂机收益前后端杀敌数计算存在误差')
}
