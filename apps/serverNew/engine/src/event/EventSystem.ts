import { ContextEngine } from '../context/ContextEngine'
import { FieldStatus } from '../differ/status'
import { SortedMap } from '../utils/SortedMap'

export abstract class EventArgs {
    /** 事件命名:类名 */
    static eventName: string = ''
}

export class EventHandler<T extends EventArgs> {
    /** 排序 */
    static sort: int = 0

    /** 是否同步 */
    isSync: boolean = true

    /** 处理事件方法 */
    handler(data: T | undefined): Promise<void> | void {
        throw new Error('未处理事件')
    }
}

export class EventCalculate<T extends EventArgs> extends EventHandler<T> {
    preHandler(data: T | undefined): Promise<void> {
        throw new Error('未预处理事件')
    }

    handler(): Promise<void> {
        throw new Error('未处理事件')
    }
}

/** 事件装饰器 */
export function Event(): ClassDecorator {
    return (target: any) => {
        target.eventName = target.name
    }
}

/** 属性监听装饰器 */
export function Listen(handlerClass: any): PropertyDecorator {
    return function (target: any, propertyKey: string) {
        return
    }
}

export class ListenArgs extends EventArgs {
    /**
     * 字段变更状态
     */
    status: FieldStatus = FieldStatus.Invalid

    /**
     * 当前字段所在的类
     */
    bean?: any

    /**
     * 只有基础类型的属性才会存在旧值
     * 当前属性的旧值,如果监听的是map/array无旧值
     */
    oldVal?: any
}

export class ListenHandler<T extends ListenArgs> extends EventHandler<T> {
    /** 处理事件方法 */
    handler(data: T | undefined) {
        throw new Error('未处理事件')
    }
}

export type EventHandlerType = typeof EventHandler<EventArgs> | typeof EventCalculate<EventArgs>

export interface DeferredEvent {
    args: EventArgs
    handler: EventHandlerType
}

export class EventSystem {
    eventMap: Map<string, SortedMap<string, EventHandlerType>>

    constructor() {
        this.eventMap = new Map()
    }

    subscribe(args: typeof EventArgs, ...handlers: EventHandlerType[]) {
        for (const handler of handlers) {
            let handlerMap = this.eventMap.get(args.name)
            if (!handlerMap) {
                this.eventMap.set(args.name, (handlerMap = new SortedMap()))
            }
            handlerMap.set(`${handler.sort}_${handler.name}`, handler)
        }
    }

    async publish(args: EventArgs) {
        if (!(args instanceof EventArgs)) {
            throw new Error('args must be an instance of AEventArgs or its subclass.')
        }
        const eventName = args.constructor.name
        const handlers = this.eventMap.get(eventName)
        if (!handlers) {
            return
        }
        for (const [, item] of handlers) {
            if (item.prototype instanceof EventCalculate) {
                const context = ContextEngine.currentCtxEngine
                if (!context) {
                    throw new Error(`calculation event '${eventName}' requires an active Action context`)
                }
                const eventCalcs = context.eventCalcs
                if (!eventCalcs[item.name]) {
                    eventCalcs[item.name] = new item() as EventCalculate<EventArgs>
                }
                await eventCalcs[item.name].preHandler(args)
                continue
            }
            const object = new item()
            if (object.isSync) {
                await object.handler(args)
            } else {
                const context = ContextEngine.currentCtxEngine
                if (!context) {
                    throw new Error(`deferred event '${eventName}' requires an active Action context`)
                }
                context.deferredEvents.push({ args, handler: item })
            }
        }
    }

    /**
     * 触发执行异步事件
     */
    async triggerAsync() {
        const context = ContextEngine.currentCtxEngine
        if (!context) {
            return
        }
        const asyncEvents = context.deferredEvents
        context.deferredEvents = []
        for (const event of asyncEvents) {
            try {
                await new event.handler().handler(event.args)
            } catch (error) {
                Log.error(`triggerAsyncEvent ${event.args.constructor.name}:${error}`)
            }
        }
        if (context.deferredEvents.length > 0) {
            await this.triggerAsync()
        }
    }

    /**
     * 触发执行指定事件
     * @param eventArg 事件类型
     */
    async trigger(eventArg: EventArgs) {
        const eventName = eventArg.constructor.name
        const handlers = this.eventMap.get(eventName)
        if (!handlers) {
            return
        }
        for (const [, item] of handlers) {
            try {
                await new item().handler(eventArg)
            } catch (e) {
                Log.error(`triggerEvent ${eventName}:${e}`)
            }
        }
    }

    /**
     * 执行计算事件,从当前上下文中获取
     * @returns
     */
    async handlerCalculate() {
        const ctx = ContextEngine.currentCtxEngine
        if (!ctx || Object.keys(ctx.eventCalcs).length <= 0) {
            return
        }
        const calculateEvents = Object.values(ctx.eventCalcs)
        ctx.eventCalcs = {}
        for (const event of calculateEvents) {
            await event.handler()
        }
        await this.handlerCalculate()
    }
}
