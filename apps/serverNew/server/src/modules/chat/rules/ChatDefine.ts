/**
 * 聊天枚举
 */
export class ChatDefine {
    static readonly QUEUE_KEY = 'chatMsg'

    //#region 聊天类型
    /** 世界聊天 */
    static readonly CHAT_TYPE_WORLD = 1

    /** 妖盟聊天 */
    static readonly CHAT_TYPE_GUILD = 2

    /** 跨服活动聊天 */
    static readonly CHAT_TYPE_CROSS_ACTIVITY = 3

    /** 系统消息 */
    static readonly CHAT_TYPE_SYSTEM = 5

    /** 好友聊天 */
    static readonly CHAT_TYPE_FRIEND = 6
    //#endregion

    //#endregion 消息类型
    /** 普通消息文本 */
    static readonly MSG_TYPE_GENERAL = 1

    /** 表情包 */
    static readonly MSG_TYPE_EMOJI = 2

    /** 系统消息 */
    static readonly MSG_TYPE_SYSTEM = 3

    /** 分享消息 */
    static readonly MSG_TYPE_SHARE = 4
    //#endregion

    //#region 分享类型
    /** 装备系统 */
    static readonly SHARE_TYPE_EQUIP = 1
    //#endregion

    // 聊天类型名
    static readonly LIST_CHAT_TYPE_NAME = {
        [this.CHAT_TYPE_WORLD]: '世界聊天',
        [this.CHAT_TYPE_GUILD]: '妖盟聊天',
        [this.CHAT_TYPE_CROSS_ACTIVITY]: '跨服聊天',
        [this.CHAT_TYPE_FRIEND]: '好友聊天',
        [this.CHAT_TYPE_SYSTEM]: '系统消息',
    }
}
