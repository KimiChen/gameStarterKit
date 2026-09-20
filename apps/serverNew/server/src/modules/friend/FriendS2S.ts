import { Service } from '../../runtime/protocol/ServiceType'

/**
 * 处理好友申请
 */
export interface ReqFriendDealApply extends Service<'Base'> {
    /** 玩家Id */
    uId: int
    /** 好友ID */
    applyUserId: int
}

/**
 * 处理成为好友
 */
export interface ReqFriendDealAccept extends Service<'Base'> {
    /** 玩家Id */
    uId: int
    /** 好友ID */
    friendId: int
}

/**
 * 拒绝好友申请处理
 */
export interface ReqFriendDealReject extends Service<'Base'> {
    /** 玩家Id */
    uId: int
    /** 好友ID */
    friendId: int
}

/**
 * 解除好友关系
 */
export interface ReqFriendDefriend extends Service<'Base'> {
    /** 玩家Id */
    uId: int
    /** 好友ID */
    friendId: int
}
