import { ApiCall, ApiCallOptions } from './ApiCall'
import { IActionLogic } from '../../../action/IActionLogic'
import { ApiReturn, BaseProtocolType } from '../../../protocol/ProtocolInterface'

export interface PendingApiItem {
    onReturn?: (ret: ApiReturn<any>) => void
}

/**
 * 处理两种action
 * 1.本来应该转发到gate,但判断目标是本地直接投到本地执行了,这种需要走完整的checkBind逻辑
 * 2.cronTask等匿名action,仅需要走并发控制即可不用进行绑定判断
 */
export class ApiCallInner<Req = any, Res = any, ServiceType extends BaseProtocolType = any> extends ApiCall {

    pending: PendingApiItem

    constructor(pending: PendingApiItem,
        options: ApiCallOptions<Req, Res, ServiceType>,
        anonymousActionArgs?: {
            handler: { new(): IActionLogic }
        }) {
        super({ ...options, handler: anonymousActionArgs ? new anonymousActionArgs.handler() : options.handler })
        this.pending = pending
    }

    protected async _sendReturn(ret: ApiReturn<any>): Promise<{ opSuccess: boolean; err?: string | undefined }> {
        if (ret.isSucc) {
            this.pending.onReturn!({
                isSucc: true,
                res: ret.res,
            })
        } else {
            this.pending.onReturn!({
                isSucc: false,
                err: ret.err,
            })
        }
        return { opSuccess: true }
    }

}
