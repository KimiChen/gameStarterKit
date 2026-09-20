import { UserInfoOnlyNetBean } from '../../../../generated/protocol/server/C2S/mod/user/UserInfoOnlyNetBean'

export interface PropItem {
    propId: int
    num: int
    equip?: EquipPropInfo
}

/**
 * 装备获取后的去处
 */
export interface EquipPropInfo {
    bag: int[]
    mail: int
    dissolve: int
    practice: int
}

export interface AwardResponse {
    awards: PropItem[]
}

/**
 * 聊天消息
 */
export interface ChatMessge {
    uInfo?: UserInfoOnlyNetBean
    time: int
    msg: string
    emojiId: int
    type: int // 聊天类型 1 世界 2 妖盟 3 跨服 4 妖盟分组聊天 5 系统消息 6 好友聊天
    msgType: int // 消息类型 1 普通消息文本 2 表情 3 系统消息 4 分享消息
    proId: int // type  type == 4 时联盟分组ID type == 5 时州ID type == 6 好友ID
    shareType: int // 分享消息的类型
    params: string // 额外参数
    paramId: int // msgType  或者 msgType == 3 系统消息id
    expiredTime: int // 消息过期时间 0 表示不过期
    shareContent: string // 分享的内容
    atIds: number[] // @目标的id
}

/**
 * Led通用推送
 */
export interface PushLedMsg {
    /**
     * system_info表的id
     */
    systemInfoId: int

    /**
     * json格式的参数列表
     */
    data: string
}

/**
 * 弹窗通用推送
 */
export interface PushPop {
    /**
     * system_info表的id
     */
    systemInfoId: int

    /**
     * json格式的参数列表
     */
    data: string
}

/**
 * 提示通用推送
 */
export interface PushTipMsg {
    /**
     * system_info表的id
     */
    systemInfoId: int

    /**
     * json格式的参数列表
     */
    data: string
}

// 逻辑出错时响应的信息
export interface PushErrorStatus {
    msg_id: string
    msg_info: string
    req_msg: string
    noLogin: boolean // 当前报错是否禁止登录
    params: string[]
}

/**
 * 玩家解除屏蔽消息
 */
export interface PushUnForbid {
    id: int //封禁类型
}
