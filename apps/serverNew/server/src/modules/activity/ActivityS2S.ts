import { Service } from '../../runtime/protocol/ServiceType'

/**
 * 活动阶段切换调度任务
 */
export interface ReqActivityStageTask extends Service<'Base'> {
    sid: int
}

/**
 * 从数据库重新加载活动,更新已经开启活动的缓存
 */
export interface ReqActivityOpenReload extends Service<'Base'> {
    sIds: number[]
}

/**
 * 把新活动版本给所有进程
 */
export interface ReqActivityNotifyProcessTimeVer extends Service<'Base'> {}

export interface ReqActivityClose extends Service<'Base'> {
    activityName: string
    id: number
    sId: number
}
