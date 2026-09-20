import { Mod } from '../../../generated/protocol/server/C2S/mod/Mod'
import { Service } from '../../runtime/protocol/ServiceType'
import { User } from '../../../generated/protocol/server/C2S/mod/base/User'

export interface ReqEnter extends Service<'Base'> {
    hash: string
    sId: int
    ver?: string
    /** 是否是重连 */
    isReconnect?: boolean
    /** 设备ID */
    deviceId: string
    /** 包版本 */
    appVer: string
    /** 资源版本 */
    resVer: string
    /** 重连版本号，重连时需要 */
    reconVer: string
    /** 渠道id */
    channelId: string
    /** 子渠道id */
    channelChildId: string
    /** 客户端通过配置获得的版本 */
    configVer: string
}

export interface ResEnter {
    userId: int
    initRole: int
    nowTime: int
    /** 本次登录前的离线秒数 */
    offlineCopperSeconds: int
    /** 本次登录结算的离线铜币 */
    offlineCopper: int
    mod?: Mod
}

/**
 * 创角色
 */
export interface ReqInitRole extends Service<'Base'> {
    /** 种族ID */
    raceId: int
    /** 名称 */
    name: string
    /** 性别 */
    sex: int
}

export interface ReqMagicWear extends Service<'Base'> {
    magicId: int
}

export interface ResMagicWear {}

export interface ReqNiubility extends Service<'Base'> {}

export interface ResNiubility {}

export interface ReqPowerOper extends Service<'Base'> {
    type: int //1add 2cost
    num: int
}

export interface ResPowerOper {
    left: int
}

export interface ReqUserAttrAdd extends Service<'Base'> {
    adds: AttrAddItem[]
}

export interface ResUserAttrAdd {}

interface AttrAddItem {
    /**
     * 属性类型
     */
    attrType: int
    /**
     * 加点数量
     */
    val: int
}

/**
 * 心跳同步接口
 */
export interface ReqUserSync extends Service<'Base'> {}

export interface ResUserSync {
    /** 服务器时间 */
    sc: int
}

/**
 * 获取玩家信息
 */
export interface ReqGetUserInfo extends Service<'Base'> {
    /** Mod模块名称，可使用.隔开嵌套子对象,如 Guild.someMap.11.xx */
    mods: string[]
    /** 每个模块或子模块对应的已有版本，
     * >=1表示客户端已有数据版本号，
     * 如果不传则会默认版本号为0表示: 客户端无数据
     * */
    versions?: int[]
}

export interface ResGetUserInfo {
    mod: Mod
}

/**
 * 用户详情信息
 */
export interface ReqUserDetailInfo extends Service<'Base'> {
    uId: int
}

export interface ResUserDetailInfo {
    user: User
}

export interface ReqCultivate extends Service<'Base'> {
    exp: int
}

export interface ResCultivate {
    lv: int
    exp: int
    fp: int
}
