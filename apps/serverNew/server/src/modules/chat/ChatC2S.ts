import { Service } from '../../runtime/protocol/ServiceType'
import { ChatMessge } from '../../runtime/protocol/C2S/commom'
import { UserInfoOnlyNetBean } from '../../../generated/protocol/server/C2S/mod/user/UserInfoOnlyNetBean'

/**
 * 获取一条世界消息
 */
export interface ReqChatGetFirstWorld extends Service<'Chat'> {}

export interface ResChatGetFirstWorld {
    msgs: ChatMessge[]
}

/**
 * 获取一条世界消息
 */
export interface ReqChatGetList extends Service<'Chat'> {
    /** 上次列表的最小的时间  */
    time: int
    /** 聊天类型 1 世界 2 妖盟 5 系统消息 6 好友聊天 */
    chatType: int
    /** 聊天对象：chatType == 6 好友ID */
    proId: number
}

export interface ResChatGetList {
    msgs: ChatMessge[]
}

/**
 * 最近的私聊好友与陌生人私聊
 */
export interface ReqChatGetRecently extends Service<'Chat'> {}

export interface ResChatGetRecently {
    list: RecentlyItem[]
}

/**
 * 发送聊天
 */
export interface ReqChatSend extends Service<'Chat'> {
    /** 消息内容 */
    msg: string
    /** 表情包ID */
    emojiId: number
    /** 聊天类型 1 世界 2 妖盟  6 好友聊天 */
    chatType: int
    /** 聊天对象：chatType == 6 好友ID */
    /**  */
    proId: number
    /** at的人的id列表 */
    atIds: number[]
    /** 分享消息的类型 1:装备分享 */
    shareType: number
    /** 分享的id，对应type的id 宴会就传宴会id, 可以多个id */
    shareIds: number[]
}

export interface ResChatSend {}

/**
 * 屏蔽玩家消息
 */
export interface PushChatForbid {
    uId: int
}

/**
 *  推送聊天消息
 */
export interface PushChat {
    msgs: ChatMessge[]
    activityName?: string
}

/**
 * 推送最近的私聊 好友与陌生人私聊的响应
 */
export interface PushChatRecentlyItem {
    list: RecentlyItem[]
}

export interface RecentlyItem {
    /** 最新的一条聊天信息 */
    msg: ChatMessge
    /** 是否为好友 */
    isFriend: boolean
    /** 消息数量 */
    msgNum: int
    /** 对方的用户信息,用于最近聊天列表的展示 */
    friendInfo?: UserInfoOnlyNetBean
}
