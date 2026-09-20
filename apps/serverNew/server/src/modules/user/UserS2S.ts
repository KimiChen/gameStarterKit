import { Service } from '../../runtime/protocol/ServiceType'

/**
 * 玩家处理退出联盟操作
 */
export interface ReqUserQuitGuild extends Service<'Base'> {
    uId: int
    guildId: int
    quitType: int
}

/**
 * 通用修改玩家身上是属性字段
 */
export interface ReqUserFieldValUpdate extends Service<'Base'> {
    uId: int
    data: PbUserFieldMap[]
}

interface PbUserFieldMap {
    field: string
    val: string
}

/**
 * gmapi-强制玩家改名
 */
export interface ReqUserRename extends Service<'Base'> {
    uId: int
    name: string
}
