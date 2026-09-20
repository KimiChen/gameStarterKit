import { Service } from '../../runtime/protocol/ServiceType'

/**
 * 称号条目
 *
 * type 与 desc 是 title.json 的展示字段，随状态一起下发，
 * 这样不加载游戏配置的客户端/工具也能直接渲染称号列表。
 */
export interface TitleEntry {
    /** 称号id */
    id: int
    /** 称号类型：1 冲榜类，2 日常类 */
    type: int
    /** 到期时间戳，0 表示永久 */
    expire: int
    /** 是否已读 */
    isRead: boolean
    /** 称号描述 */
    desc: string
}

/**
 * 拉取称号列表
 */
export interface ReqTitleList extends Service<'Base'> {}

export interface ResTitleList {
    /** 当前佩戴的称号id，0 表示未佩戴 */
    titleId: int
    /** 当前佩戴称号的到期时间戳，0 表示永久 */
    titleExpire: int
    /** 已拥有的称号，已过滤掉过期称号 */
    titles: TitleEntry[]
}

/**
 * 领取日常类称号
 */
export interface ReqTitleActivate extends Service<'Base'> {
    /** 称号id */
    titleId: int
}

/**
 * 佩戴称号
 */
export interface ReqTitleDress extends Service<'Base'> {
    /** 称号id */
    titleId: int
}

/**
 * 卸下当前佩戴的称号
 */
export interface ReqTitleUnDress extends Service<'Base'> {}

/**
 * 标记称号已读
 */
export interface ReqTitleRead extends Service<'Base'> {
    /** 称号id */
    titleId: int
}
