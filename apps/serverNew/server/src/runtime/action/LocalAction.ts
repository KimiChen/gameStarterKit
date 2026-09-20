import {
    ApiCall,
    AsyncReturn,
    Call,
    IActionLogic,
    LocalActionRegistry,
    MessageHelper,
    getServerIdByUid,
} from '@arthropoda/game-engine'
import { ServiceType } from '../../../generated/protocol/server/S2S/serviceProto'
import { Actions as S2SActions } from '../../../generated/protocol/server/S2S/actions'
import { RpcAttachTask } from './RpcAttachTask'

type LocalActionClass = (typeof S2SActions)[keyof typeof S2SActions]

type LocalActionName = keyof ServiceType['api']

type LocalActionReq<T extends LocalActionName> = ServiceType['api'][T]['req']

type LocalActionRes<T extends LocalActionName> = ServiceType['api'][T]['res']

export class LocalAction {
    /**
     * [className,apiPath]
     */
    private static _action2ApiName: Map<string, string>

    static registerAction2ApiName(actions: Record<string, { new (): any }>) {
        LocalActionRegistry.register(actions)
        this._action2ApiName = new Map()
        for (const apiName in actions) {
            const actionClass = actions[apiName]
            if (this._action2ApiName.has(actionClass.name)) {
                Log.error('repeated registered name for actionClass')
                continue
            }
            this._action2ApiName.set(actionClass.name, apiName)
        }
    }

    static getAction2ApiName(actionClassParam: LocalActionClass): LocalActionName {
        return this._action2ApiName.get(actionClassParam.name) as LocalActionName
    }

    /** 首选传协议路由；请求和响应会由生成协议精确推导。 */
    static send<T extends LocalActionName>(apiName: T, req: LocalActionReq<T>, uId: int, sId: int): void
    /** @deprecated Action 基类的历史 any 签名无法准确反推协议；新代码请传协议路由。 */
    static send(actionClass: LocalActionClass, req: any, uId: int, sId: int): void
    static send(apiOrAction: LocalActionName | LocalActionClass, req: any, uId: int, sId: int): void {
        if (!sId && uId) {
            sId = getServerIdByUid(uId)
        }

        const apiName = this.resolveApiName(apiOrAction)
        const cb = () => {
            MessageHelper.sendLocalAction(uId, sId, new Call(apiName, req))
        }
        const ok = RpcAttachTask.tryRegisterCB(cb)
        if (!ok) {
            cb()
        }
    }

    /**
     * 同步等待的远程调用需要执行的action
     */
    static call<T extends LocalActionName>(
        apiName: T,
        req: LocalActionReq<T>,
        uId: int,
        sId: int,
    ): Promise<AsyncReturn<LocalActionRes<T>>>
    /** @deprecated Action 基类的历史 any 签名无法准确反推协议；新代码请传协议路由。 */
    static call(actionClass: LocalActionClass, req: any, uId: int, sId: int): Promise<AsyncReturn<any>>
    static call(
        apiOrAction: LocalActionName | LocalActionClass,
        req: any,
        uId: int,
        sId: int,
    ): Promise<AsyncReturn<any>> {
        if (!sId && uId) {
            sId = getServerIdByUid(uId)
        }
        return MessageHelper.callLocalAction(uId, sId, new Call(this.resolveApiName(apiOrAction), req))
    }

    /** 在当前固定区服进程内广播本地 Action。 */
    static broadcast<T extends LocalActionName>(apiName: T, req: LocalActionReq<T>): void
    /** @deprecated Action 基类的历史 any 签名无法准确反推协议；新代码请传协议路由。 */
    static broadcast(actionClass: LocalActionClass, req: any): void
    static broadcast(apiOrAction: LocalActionName | LocalActionClass, req: any): void {
        const apiName = this.resolveApiName(apiOrAction)
        const cb = () => {
            MessageHelper.broadcastLocalAction(new Call(apiName, req))
        }
        const ok = RpcAttachTask.tryRegisterCB(cb)
        if (!ok) {
            cb()
        }
    }

    /** 无等待调用回调, 独立上下文 */
    static asyncDoFunc(fn: () => void | Promise<void>) {
        const param = class tmp implements IActionLogic {
            async getBindId(call: ApiCall<any, any, any>): Promise<number | undefined> {
                return 0
            }

            async actionBefore(call: ApiCall<any, any, any>): Promise<void> {
                return
            }

            async doAction(req: any, res: any): Promise<void> {
                await fn()
            }
        }

        const cb = () => {
            MessageHelper.asyncDoAction(0, 0, new Call('default/Default', {}), param)
        }
        const ok = RpcAttachTask.tryRegisterCB(cb)
        if (!ok) {
            cb()
        }
    }

    /**
     * 同步等待调用回调,并返回函数结果,独立上下文
     */
    static syncDoFunc<T>(fn: () => T | Promise<T>): Promise<Awaited<T>> {
        return MessageHelper.syncDoFunc(fn)
    }

    private static resolveApiName(apiOrAction: LocalActionName | LocalActionClass): LocalActionName {
        return typeof apiOrAction === 'string' ? apiOrAction : this.getAction2ApiName(apiOrAction)
    }
}
