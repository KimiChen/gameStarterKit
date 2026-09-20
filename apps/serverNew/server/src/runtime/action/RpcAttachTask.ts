import { ContextEngine } from '@arthropoda/game-engine'
import { IActionAttachTask } from '@arthropoda/game-engine'

/**
 * 异步投递的业务等redsi task落库后再执行
 */
export class RpcAttachTask implements IActionAttachTask {
    async onDoAction(res: any): Promise<void> {
        return
    }

    async onEngineEnd(): Promise<void> {
        for (const cb of Ctx.rpcAndQueueSendCB) {
            await cb()
        }
    }

    async onStart(): Promise<void> {
        return
    }

    /** 将回调放到当前action结束后再执行, 会等待redis入库任务之后执行 */
    static tryRegisterCB(cb: () => void | Promise<void>): boolean {
        //global.Ctx 判断的是api中调用时, Ctx.rpcAndQueueSendCB判断的是进程启动时
        if (ContextEngine.isValid && Ctx.rpcAndQueueSendCB) {
            Ctx.rpcAndQueueSendCB.push(cb)
            return true
        }
        return false
    }
}
