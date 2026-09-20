import { ApiCall } from '../net/client/base/ApiCall'

export interface IActionLogic<Req = any, Res = any> {
    /** 获取绑定Id */
    getBindId(call: ApiCall<Req, Res>): Promise<int | undefined>
    /** 执行doAction之前 */
    actionBefore(call: ApiCall<Req, Res>): Promise<void>
    /** 处理业务 */
    doAction(req: Req, res: Res): Promise<void>
}
