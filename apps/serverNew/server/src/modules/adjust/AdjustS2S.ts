import { Service } from '../../runtime/protocol/ServiceType'

/**
 * 时间偏移量增加等
 */
export interface ReqTimeAddChange extends Service<'Base'> {
    timeFormat: string
}

/**
 * 重新加载配置
 */
export interface ReqConfigReload extends Service<'Base'> {}

/**
 * 重新加载配置
 */
export interface ReqConfigReloadBroadcast extends Service<'Center'> {}
