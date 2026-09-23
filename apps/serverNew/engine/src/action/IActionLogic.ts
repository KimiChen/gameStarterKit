import { ApiCall } from '../net/client/base/ApiCall'

export interface IActionLogic<Req = any, Res = any> {
    /** 空或 -1 留在普通 Worker；非负整数按取余定位 Task Worker。先于 getBindId 解析。 */
    getTaskGroupId?(call: ApiCall<Req, Res>): number | null | undefined | Promise<number | null | undefined>
    /** 进程内串行键；空值默认使用 uid。 */
    getBindId?(call: ApiCall<Req, Res>): number | null | undefined | Promise<number | null | undefined>
    /** 执行doAction之前 */
    actionBefore(call: ApiCall<Req, Res>): Promise<void>
    /** 处理业务 */
    doAction(req: Req, res: Res): Promise<void>
}
