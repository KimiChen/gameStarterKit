import { ContextLogic } from '../context/ContextLogic'
import { SortedMap } from '../utils/SortedMap'
import { Event, EventArgs, EventHandler, EventSystem } from './EventSystem'

/**
 * 接口事件参数定义
 */
@Event()
export class ActionEventArgs extends EventArgs {
    ctx!: ContextLogic

    req: any

    res: any

    constructor(ctx: ContextLogic, req: any, res: any) {
        super()
        this.ctx = ctx
        this.req = req
        this.res = res
    }
}

/**
 * 接口事件参数处理基类
 */
export abstract class ActionEventHandlerBase extends EventHandler<ActionEventArgs> {

    static sort: number = 0

    isSync: boolean = true

    abstract handler(data: ActionEventArgs | undefined): Promise<void>;
}

/**
 * 接口订阅事件系统
 */
export class ActionEventSystem {

    private static eventSys: EventSystem = new EventSystem()

    static async init(data: Map<string, typeof ActionEventHandlerBase[]>) {
        for (const [action, handlers] of data) {
            this.subscribe(action, ...handlers)
        }
    }

    static subscribe<T extends string>(action: T, ...handlers: typeof ActionEventHandlerBase[]) {
        for (const handler of handlers) {
            let handlerMap = this.eventSys.eventMap.get(action)
            if (!handlerMap) {
                this.eventSys.eventMap.set(action, handlerMap = new SortedMap())
            }
            handlerMap.set(`${handler.sort}_${handler.name}`, handler as typeof EventHandler)
        }
    }

    static async trigger(ctx: ContextLogic, action: string) {
        const args = new ActionEventArgs(ctx, ctx.call!.req, ctx.call!.res)
        const events = this.eventSys.eventMap.get(action)
        if (!events) {
            return
        }
        for (const [key, handler] of events) {
            Log.debug(`trigger ${action} event:${key}`)
            await new handler().handler(args)
        }
    }
}