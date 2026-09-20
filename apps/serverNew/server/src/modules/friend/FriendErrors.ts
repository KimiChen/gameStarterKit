import { GameError } from '@arthropoda/game-engine'

export class FriendErrors {
    static readonly FriendHad = new GameError(137001, '对方已是好友')

    static readonly FriendNot = new GameError(137002, '对方不是好友')

    static readonly FriendNotApply = new GameError(137003, '未申请添加对方为好友')

    static readonly FriendHadApply = new GameError(137004, '已申请添加对方为好友')

    static readonly FriendNotBlack = new GameError(137005, '对方不在黑名单中')

    static readonly FriendHadBlack = new GameError(137006, '对方已在黑名单中')

    static readonly FriendHadTargetBlack = new GameError(137007, '已被对方拉入黑名单')

    static readonly FriendAddSelf = new GameError(137008, '不能添加自己为好友')

    static readonly FriendTargetNotExists = new GameError(137009, '对方不存在')

    static readonly FriendNotStranger = new GameError(137010, '对方不在陌生人列表中')

    static readonly FriendUpperLimit = new GameError(137011, '好友名单已满')

    static readonly FriendAgreeLimit = new GameError(137012, '好友名单已满，无法同意')

    static readonly FriendTargetUpperLimit = new GameError(137013, '对方好友名单已满')

    static readonly FriendTargetAgreeLimit = new GameError(137014, '对方好友名单已满，无法同意')

    static readonly FriendBlackLimit = new GameError(137015, '黑名单已满')

    static readonly FriendModuleOff = new GameError(137016, '未解锁书信功能')

    static readonly FriendTargetModuleOff = new GameError(137017, '对方未解锁书信功能')

    static readonly FriendApplyLimit = new GameError(137018, '对方好友申请已满，无法申请')

    static readonly FriendStrangerLimit = new GameError(137019, '超过陌生人聊天的人数上限')
}
