import { ApiCall } from '../net/client/base/ApiCall'
import { ServerTask } from './ServerTask'
import { GameError } from '../error/GameError'
import { ContextEngine } from '../context/ContextEngine'
import { format } from 'util'
import type { ActionRouting } from '../action/ActionRouting'

export type error = GameError

/**
 * 消息从排队执行开始到准备执行业务时间,在等待时间超过阈值,不继续执行
 */
export const ApiCallWaitSeconds = 5

/** 排队中的请求 */
export interface QueuedApiCall {
    call: ApiCall
    /** 轮到该请求、并且它执行结束后调用 */
    resolve: () => void
    /** 排队超时定时器，出队时清除 */
    timer?: ReturnType<typeof setTimeout>
}

export class CallGroup {
    callQueue: QueuedApiCall[] = []

    /**
     * 正在执行的那个请求的 traceId。
     * 同 traceId 的请求属于它内部的嵌套调用（api 调本地 action 等），不是独立请求。
     */
    callingTraceId = 0

    constructor(public currentCall: ApiCall) {
        currentCall.callGroup = this
        this.callingTraceId = currentCall.messageHead.traceId
    }

    /**
     * 入队等待执行。
     *
     * 返回的 promise 在「轮到该请求并且它执行结束」后才 resolve —— 调用方可以据此等待请求
     * 真正处理完，而不是仅仅排进队列。同连接串行、同步嵌套调用等语义都依赖这一点。
     *
     * 排队超过 ApiCallWaitSeconds 仍未轮到的请求直接报错返回，避免请求无限期挂着。
     */
    add(call: ApiCall): Promise<void> {
        return new Promise<void>((resolve) => {
            const item: QueuedApiCall = { call, resolve }
            call.callGroup = this
            this.callQueue.push(item)
            item.timer = setTimeout(() => {
                const index = this.callQueue.indexOf(item)
                if (index < 0) {
                    //已经出队开始执行，交给执行侧负责
                    return
                }
                this.callQueue.splice(index, 1)
                Log.net.error(
                    `uid:${call.uId}, bindId:${call.bindId}, 排队${RouteAction.queueWaitSeconds}秒仍未轮到,放弃 api=${call.getApiName()}`,
                )
                call.error(GameError.apiCallQueueTimeout.getItem()).then(
                    () => resolve(),
                    () => resolve(),
                )
            }, RouteAction.queueWaitSeconds * 1000)
            const timer = item.timer as any
            if (typeof timer?.unref === 'function') {
                timer.unref()
            }
        })
    }

    next(): QueuedApiCall | undefined {
        const item = this.callQueue.shift()
        if (!item) {
            return undefined
        }
        if (item.timer) {
            clearTimeout(item.timer)
            item.timer = undefined
        }
        this.currentCall = item.call
        this.callingTraceId = item.call.messageHead.traceId
        return item
    }
}

export default class RouteAction {
    /** 可选的跨进程路由器；返回 true 表示请求已在目标进程执行，本进程不再执行。 */
    static processRouter?: (call: ApiCall, routing: ActionRouting) => Promise<boolean>
    /**
     * 排队等待上限（秒）：请求入队后超过这个时间还没轮到执行，就直接报错返回，
     * 避免它无限期挂在队列里。默认取 ApiCallWaitSeconds，部署环境可按需要调整。
     */
    static queueWaitSeconds = ApiCallWaitSeconds

    /**
     * 请求分组表：只按 bindId 串行，不使用 taskGroupId 作为队列键。
     * 表里存在某个 key 表示该分组的业务正在执行，后来的请求需要排队。
     */
    static callGroups = new Map<number, CallGroup>()

    static async onApiCall(call: ApiCall): Promise<void> {
        //防止调用递归调用
        call.messageHead.invokeLayer++
        if (call.messageHead.invokeLayer > 10) {
            const s = format(
                'onApiCall#调用链中含有递归或循环,调用层级过高 最后一次调用api=%s,layerNum=%s',
                call.getApiName(),
                call.messageHead.invokeLayer,
            )
            Log.error(s)
            await call.error(s, {
                code: GameError.runtimeError.code,
                message: s,
            })
            return
        }

        const routing = await RouteAction.resolveRouting(call)
        if (RouteAction.processRouter && (await RouteAction.processRouter(call, routing))) {
            return
        }
        const bindId = call.bindId
        if (bindId === undefined) {
            //没有分组，直接执行
            await RouteAction.doAction(call)
            return
        }

        const running = RouteAction.callGroups.get(bindId)
        if (running) {
            //已经有分组的请求在执行
            const sameTrace = running.callingTraceId !== 0 && running.callingTraceId === call.messageHead.traceId
            if (sameTrace && RouteAction.isNestedInGroup(running)) {
                //同分组内的同步嵌套调用（api 内再调本地 action）：父调用正在 await 它，
                //入队会变成自己等自己，就地执行
                await RouteAction.doAction(call)
                return
            }
            if (sameTrace) {
                //跨进程调用又绕回同一分组：持有分组的调用正在别的进程等它，入队必然死锁，报错返回
                Log.error(
                    `远程调用又返回到同一分组导致死锁!traceId: ${running.callingTraceId}, 起始请求: ` +
                        JSON.stringify({
                            uId: running.currentCall.messageHead.uId,
                            route: running.currentCall.getApiName(),
                            req: running.currentCall.req,
                        }) +
                        '，远程调用：' +
                        JSON.stringify({
                            uId: call.messageHead.uId,
                            route: call.getApiName(),
                            req: call.req,
                        }),
                )
                await call.error('远程调用又返回到同一分组导致死锁!', {
                    code: GameError.runtimeError.code,
                    message: 'call_dead_look',
                })
                return
            }
            //排队，等真正轮到自己并且执行结束
            await running.add(call)
            return
        }

        const group = new CallGroup(call)
        RouteAction.callGroups.set(bindId, group)
        Log.net.debug(`uid:${call.uId}, bindId:${bindId}, 开始执行业务${call.getApiName()}`)
        try {
            await RouteAction.doAction(call)
            //执行完检查还有没有请求要跟在后面执行
            let item: QueuedApiCall | undefined
            // eslint-disable-next-line no-constant-condition
            while ((item = group.next())) {
                try {
                    Log.net.debug(`uid:${item.call.uId}, bindId:${bindId}, 串行继续执行业务${item.call.getApiName()}`)
                    await RouteAction.doAction(item.call)
                } finally {
                    item.resolve()
                }
            }
        } finally {
            //业务抛错也必须释放分组，否则该分组的后续请求会一直排在被占用的队列里
            RouteAction.callGroups.delete(bindId)
            RouteAction.abortQueue(group)
        }
    }

    /** 先解析执行进程，再解析串行键；失败直接终止，不能换组后继续执行业务。 */
    private static async resolveRouting(call: ApiCall): Promise<ActionRouting> {
        if (!call.routingResolved) {
            const taskGroupId = await call.actionHandler?.getTaskGroupId?.(call)
            if (taskGroupId != null && taskGroupId !== -1 && (!Number.isSafeInteger(taskGroupId) || taskGroupId < 0)) {
                throw new Error(`invalid taskGroupId for ${call.getApiName()}`)
            }
            call.taskGroupId = taskGroupId == null || taskGroupId === -1 ? undefined : taskGroupId

            const bindId = await call.actionHandler?.getBindId?.(call)
            if (bindId != null && (!Number.isSafeInteger(bindId) || bindId < 0)) {
                throw new Error(`invalid bindId for ${call.getApiName()}`)
            }
            call.bindId = bindId ?? (Number.isSafeInteger(call.uId) && call.uId > 0 ? call.uId : undefined)
            call.routingResolved = true
        }
        return { taskGroupId: call.taskGroupId, bindId: call.bindId }
    }

    /**
     * 当前调用是否发生在该分组的执行上下文里。
     *
     * 同分组的同步嵌套调用（api 内再调本地 action）必须就地执行：父调用正在 await 它，
     * 而分组队列要等父调用返回才会继续，入队就是自己等自己。
     * 跨进程绕回来的调用虽然 traceId 也相同，但它跑在全新的上下文里，不会被误判成嵌套。
     */
    private static isNestedInGroup(group: CallGroup): boolean {
        if (!ContextEngine.isValid) {
            return false
        }
        return ContextEngine.currentCtxEngine!.ctxLogic?.call?.callGroup === group
    }

    /** 分组异常退出时，把还留在队列里的请求全部报错返回，避免它们一直等下去 */
    private static abortQueue(group: CallGroup) {
        if (group.callQueue.length === 0) {
            return
        }
        const pending = group.callQueue
        group.callQueue = []
        for (const item of pending) {
            if (item.timer) {
                clearTimeout(item.timer)
                item.timer = undefined
            }
            Log.net.error(`bindId:${item.call.bindId}, 分组异常退出, 放弃 api=${item.call.getApiName()}`)
            item.call.error(GameError.apiCallQueueTimeout.getItem()).then(
                () => item.resolve(),
                () => item.resolve(),
            )
        }
    }

    static async doAction(call: ApiCall) {
        const task = new ServerTask()
        task.call = call

        await ContextEngine.asyncLocalStorage.run(task.ctx, async () => {
            await task.doAction()
            ContextEngine.currentCtxEngine!.expired = true
        })
    }

    /**
     * 等待并处理所有的Action队列
     */
    static async waitDealAction() {
        const maxAttempts = 30 // 最大尝试次数
        let attemptCount = 0 // 当前尝试次数

        async function checkAndDelay() {
            if (attemptCount++ >= maxAttempts) {
                Log.game.error(`checkAndDelay 最大尝试次数已达到${maxAttempts}，处理失败。`)
                return false
            }
            let queueLen = false
            RouteAction.callGroups.forEach((group) => {
                if (group.callQueue.length > 0) {
                    queueLen = true
                    return
                }
            })
            if (queueLen) {
                Log.game.error(`Attempt ${attemptCount}/${maxAttempts}, found queue, waiting...`)
                await new Promise((resolve) => setTimeout(resolve, 1000))
                return checkAndDelay()
            }
            return true
        }

        // 未处理的action返回错误提示
        async function rejectAction() {
            RouteAction.callGroups.forEach((group) => {
                const pending = group.callQueue
                group.callQueue = []
                for (const item of pending) {
                    if (item.timer) {
                        clearTimeout(item.timer)
                        item.timer = undefined
                    }
                    item.call.error(GameError.apiCallQueueTimeout.getItem()).then(
                        () => item.resolve(),
                        () => item.resolve(),
                    )
                }
            })
        }

        if (!(await checkAndDelay())) {
            await rejectAction()
        }
    }
}
