import { UserInfoOnlyNetBean } from '../../../generated/protocol/server/C2S/mod/user/UserInfoOnlyNetBean'
import { Service } from '../../runtime/protocol/ServiceType'

/**
 * 接受申请
 */
export interface ReqFriendAccept extends Service<'Base'> {
    /** 好友Id */
    id: int
}

export interface ResFriendAccept {}

/** 好友申请 */
export interface ReqFriendApply extends Service<'Base'> {
    /** 好友ID */
    id: int
}

export interface ResFriendApply {}

export interface ReqFriendApplyList extends Service<'Base'> {}

export interface ResFriendApplyList {
    /**
     * 好友申请列表
     */
    list: FriendInfo[]
}

// 好友信息
export interface FriendInfo {
    uInfo: UserInfoOnlyNetBean
    online: boolean // 是否在线
    time: int // 时间
    status: int // 0无，1好友，2申请中
}

/**
 * 一键同意
 */
export interface ReqFriendBatchAllow extends Service<'Base'> {}

export interface ResFriendBatchAllow {}

/**
 * 一键拒绝
 */
export interface ReqFriendBatchReject extends Service<'Base'> {}

export interface ResFriendBatchReject {}

/**
 * 添加黑名单
 */
export interface ReqFriendBlackAdd extends Service<'Base'> {
    /**
     * 好友Id
     */
    id: int
}

export interface ResFriendBlackAdd {}

/**
 * 移除黑名单
 */
export interface ReqFriendBlackDel extends Service<'Base'> {
    /**
     * 好友Id
     */
    ids: int[]
}

export interface ResFriendBlackDel {}

/**
 * 删除与好友的聊天
 */
export interface ReqFriendChatDel extends Service<'Base'> {
    /**
     * 好友Id
     */
    id: int
}

export interface ResFriendChatDel {}

/**
 * 删除好友
 */
export interface ReqFriendDelete extends Service<'Base'> {
    /** 好友Id */
    id: int
}

export interface ResFriendDelete {}

/**
 * 拒绝添加
 */
export interface ReqFriendReject extends Service<'Base'> {
    /**
     * 好友Id
     */
    id: int
}

export interface ResFriendReject {}

/**
 * 查找指定玩家
 */
export interface ReqFriendSearch extends Service<'Base'> {
    /**
     * 玩家ID或者名字
     */
    name: string
}

export interface ResFriendSearch {
    info?: FriendInfo[]
}

/**
 * 好友信息动，需要推送的时候使用
 */
export interface PushFriendUpdate {
    /**
     * 操作类型,1:添加黑名单
     */
    action: int

    /**
     * 操作的好友Id
     */
    friendId: int
}
