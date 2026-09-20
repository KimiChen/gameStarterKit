import { Service } from '../../runtime/protocol/ServiceType'

/**
 * 请求日志列表
 */
export interface ReqFightLogGetInfo extends Service<'Base'> {
    /**
     * 获取的日志类型 1玩家日志 2怪物日志 3其他日志 4妖盟日志 5砍价日志 6拖箱子日志
     */
    logTypes: int[]
}

export interface ResFightLogGetInfo {
    /** 玩家日志 */
    playerLogs?: PbFightLogItem[]
    /** 怪物日志 */
    monsterLogs?: PbFightLogItem[]
    /** 其他日志 */
    otherLogs?: PbFightLogItem[]
    /** 妖盟日志 */
    guildLogs?: PbFightLogItem[]
    /** 砍价日志 */
    bargainLogs?: PbFightLogItem[]
    /** 拖箱子日志 */
    homeLogs?: PbFightLogItem[]
}

/**
 * 新战斗日志推送
 */
export interface PushNewFightLog {
    /**
     * 新增日志类型 1、玩家日志；2、怪物日志；3、其他日志
     */
    type: int

    /**
     * 具体日志
     */
    log: PbFightLogItem
}

export interface PbFightLogItem {
    /**
     * 日志配置ID
     */
    id: int
    /**
     * 日志配置对应的json参数列表
     */
    params: string
    /**
     *  日志产生时间
     */
    time: int
}
