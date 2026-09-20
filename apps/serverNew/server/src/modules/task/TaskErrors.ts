import { GameError } from '@arthropoda/game-engine'

export class TaskErrors {
    static readonly TaskBeforeErr = new GameError(12001, '不匹配当前任务')

    static readonly TaskAwardNoEnough = new GameError(12002, '不满足领取奖励条件')

    static readonly TaskNoComplete = new GameError(12003, '任务未完成')

    static readonly TaskRepeatAward = new GameError(12004, '已领奖')

    static readonly TaskLivenessNoEnough = new GameError(12005, '活跃度不足')

    static readonly TaskTaskNoOpen = new GameError(12006, '未解锁任务')

    static readonly TaskIndexError = new GameError(12007, '任务配置索引异常')

    static readonly TaskNoExist = new GameError(12008, '不存在的任务类型')
}
