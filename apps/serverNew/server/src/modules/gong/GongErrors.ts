import { GameError } from '@arthropoda/game-engine'

export class GongErrors {
    static readonly GongMaxLv = new GameError(17010, '功法已满级')

    static readonly GongNotEnoughGongLv = new GameError(17011, '功法等级不足')

    static readonly GongMaxSkillLv = new GameError(17012, '妖术已满级')

    static readonly GongNoNeedRestSkill = new GameError(17013, '妖术无需重置')

    static readonly GongNoCondition = new GameError(17014, '突破条件不满足')

    static readonly GongNotEnoughLv = new GameError(17015, '等级不足')

    static readonly GongUnLock = new GameError(17016, '功法技能未解锁')

    static readonly GongNotTimes = new GameError(17017, '法力值不足')

    static readonly TreasureNoHave = new GameError(18001, '未拥有该奇珍')

    static readonly TreasureNotQuality = new GameError(18002, '所选升级材料错误')

    static readonly TreasureErrNum = new GameError(18003, '所选升级材料数量错误')

    static readonly TreasureMaxLv = new GameError(18004, '奇珍已满级')

    static readonly TreasureNoCondition = new GameError(18005, '玩家等级不足')
}
