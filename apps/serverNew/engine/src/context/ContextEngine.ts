import { ContextLogic } from './ContextLogic'
import { IdFieldType, RootBean } from '../differ/bean'
import { DifferCache } from '../differ/differCache'
import { AsyncLocalStorage } from 'async_hooks'
import type { DeferredEvent, EventArgs, EventCalculate } from '../event/EventSystem'

export interface ContextFactory<T extends ContextLogic> {
    newContext: () => T
}

export class ContextEngineExport {
    /**
     * @throws 安全措施如果访问过期的上下文会报错,或者使用 isValid 判断是否有效
     * api进程中没有,main.ts启动过程也没有,需要业务进行判空
     * 不提供默认上下文原因是,为了防止潜在的内存泄漏风险
     * 数据从asyncLocalStorage中获得,直接赋值无效,所以只有get方法  
     */
    static get currentCtxEngine(): ContextEngine | undefined {
        return ContextEngine.currentCtxEngine
    }

    static get isValid(): boolean {
        return ContextEngine.isValid
    }
}
/**
 * 底层使用的上下文
 */
export class ContextEngine {
    static readonly asyncLocalStorage = new AsyncLocalStorage()

    static contextFactory?: ContextFactory<ContextLogic>

    private static lastCtxId = 0

    ctxId: int = 0

    /** 业务里已经加载的Hash */
    loadedHash = new Map<string, RootBean>()

    /** 业务里已经加载的HashJson */
    loadedHashJson = new Map<string, Map<IdFieldType, RootBean>>()

    differ?: DifferCache

    expired: boolean = false

    /** 上下文变量缓存 */
    cacheVars: IVariableCache

    /** 业务使用的上下文 */
    ctxLogic: ContextLogic

    /** 业务使用的计数事件 */
    eventCalcs: { [key: string]: EventCalculate<EventArgs> } = {}

    /** 当前 Action 成功提交后才会执行的延后事件。 */
    deferredEvents: DeferredEvent[] = []

    constructor() {
        this.ctxId = ++ContextEngine.lastCtxId
        if (ContextEngine.contextFactory) {
            this.ctxLogic = ContextEngine.contextFactory.newContext()
        } else {
            this.ctxLogic = new ContextLogic()
        }
        this.cacheVars = {}
    }

    /**
     * @throws 安全措施如果访问过期的上下文会报错,或者使用 isValid 判断是否有效
     * api进程中没有,main.ts启动过程也没有,需要业务进行判空
     * 不提供默认上下文原因是,为了防止潜在的内存泄漏风险
     * 数据从asyncLocalStorage中获得,直接赋值无效,所以只有get方法  
     */
    static get currentCtxEngine(): ContextEngine | undefined {
        const currentCtx = this.asyncLocalStorage.getStore() as ContextEngine
        if (currentCtx === undefined) {
            // throw new Error('主进程中调用,尚未初始化上下文,请用投递或者匿名action的方式调用,或者用延迟函数,或用isInitCtxEngine判空')
            return undefined
        }
        if (currentCtx.expired) {
            throw new Error(
                '访问了生命周期已经结束的上下文,请避免action结束后还HashLoad等访问上下文的方法,自定义的函数漏写await也会导致该报错',
            )
        }
        return currentCtx
    }

    /**
     * 有上下文不让访问和没有访问为undefined还是有区别,所有增加了这个方法
     */
    static get isValid(): boolean {
        const currentCtx = this.asyncLocalStorage.getStore() as ContextEngine
        if (!currentCtx) {
            return false
        }
        if (currentCtx.expired) {
            return false
        }
        return true
    }

    static get cacheMillisecond(): number {
        const currentCtx = this.asyncLocalStorage.getStore() as ContextEngine
        if (currentCtx === undefined) {
            return 0
        }
        return currentCtx.cacheVars?.millisecond ?? 0
    }

    static set cacheMillisecond(v: number) {
        const currentCtx = this.asyncLocalStorage.getStore() as ContextEngine
        if (currentCtx === undefined) {
            return
        }
        currentCtx.cacheVars.millisecond = v
    }
}

interface IVariableCache {
    millisecond?: number
}
