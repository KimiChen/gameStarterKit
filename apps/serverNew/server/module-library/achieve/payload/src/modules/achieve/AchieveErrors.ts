import { GameError } from '@arthropoda/game-engine'

export class AchieveErrors {
    static readonly AchieveTaskComplete = new GameError(11001, '成就任务全部完成')

    static readonly AchieveTaskNoComplete = new GameError(11002, '不满足领取成就奖励条件')

    static readonly AchievePointNotEnough = new GameError(11003, '资历点不足')

    static readonly AchieveRepeatAward = new GameError(11004, '重复领奖')

    static readonly AchieveNoLabel = new GameError(11005, '标签不存在')

    static readonly AchieveLabelColNoEnough = new GameError(11006, '标签栏位不足')
}
