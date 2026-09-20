import { GameError } from '@arthropoda/game-engine'

export class ChatErrors {
    static readonly ChatMsgIsNull = new GameError(16001, '消息为空')

    static readonly ChatMsgForbid = new GameError(16002, '聊天被禁止')

    static readonly ChatTimeLimit = new GameError(16003, '每{0}秒只能发言一次')

    static readonly ChatChatWorldUnlock = new GameError(16004, '京城聊天未解锁，请先完成历练')

    static readonly ChatChatShareTypeErr = new GameError(16005, '聊天分享类型错误')

    static readonly ChatTypeErr = new GameError(16006, '聊天类型错误')

    static readonly ChatChatShareLimit = new GameError(16007, '每五分钟只能分享一次')

    static readonly ChatLocked = new GameError(16008, '聊天功能未解锁')

    static readonly ChatNotSelf = new GameError(16009, '不能和自己聊天')

    static readonly ChatShareTimesLimit = new GameError(16010, '分享次数不足')

    static readonly ChatStrangerNotReply = new GameError(16011, '对方还未回复，请耐心等待一下')

    static readonly ChatNotAtSelf = new GameError(16012, '不要@自己')

    static readonly CrossNotOpen = new GameError(36001, '跨服尚未开启')
}
