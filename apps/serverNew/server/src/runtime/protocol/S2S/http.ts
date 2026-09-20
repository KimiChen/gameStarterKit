import { Service } from '../ServiceType'

// 该协议仍绑定内部 JSON Action 和兼容记录；只有完成路由迁移与记录升级后才能删除。
export interface ReqOnlyJson extends Service<'Http'> {
    json: string
}

export interface ResOnlyJson {
    json: string
}
