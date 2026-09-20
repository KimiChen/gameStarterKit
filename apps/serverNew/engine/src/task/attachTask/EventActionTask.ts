import { ActionEventSystem } from '../../event/ActionEventSystem'
import { IActionAttachTask } from '../IAttachTask'
import { ContextEngine } from '../..'

/**
 * 接口事件执行器
 */
export class EventActionTask implements IActionAttachTask {
    async onStart() {
        return  
    }

    async onDoAction(_res: any) {
        const ctx = ContextEngine.currentCtxEngine!.ctxLogic
        await ActionEventSystem.trigger(ctx, ctx.call!.getApiName())
    }

    async onEngineEnd() {
        return
    }
}
