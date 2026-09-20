import { GameError } from '@arthropoda/game-engine'

export class SceneErrors {
    static readonly SceneBehaviorNotFound = new GameError(160001, '找不到场景行为执行')

    static readonly SceneNotFound = new GameError(160002, '找不到场景')

    static readonly SceneUsePropCd = new GameError(160003, '使用道具CD中')

    static readonly SceneNotJoin = new GameError(160004, '不满足进入场景条件')

    static readonly SceneJoinCd = new GameError(160005, '进入场景cd中')

    static readonly SceneJoinLv = new GameError(160006, '等级不足')

    static readonly SceneJoinAlready = new GameError(160007, '你已在当前场景中')

    static readonly SceneInviteShield = new GameError(160008, '已屏蔽过该玩家')

    static readonly ScenePlayerFull = new GameError(160009, '场景人数已满')

    static readonly SceneInviteSameScene = new GameError(160010, '不能邀请同场景内的玩家')

    static readonly SceneInviteNotOpen = new GameError(160011, '当前系统不支持邀请')

    static readonly SceneNoRoom = new GameError(160012, '当前场景不分房间')
}
