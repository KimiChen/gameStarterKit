import {
    isLobbyRouteOutcome,
    RouteAction,
    type ActionRouting,
    type ApiCall,
    type ObjectActionCall,
} from '@arthropoda/game-engine'
import type { ProcessPipeOutcome, ProcessPipeRequest } from './processPipe'
import { resolvePlayerWorker } from './resolvePlayerWorker'
import type { RuntimeServerLike } from './runtimeTypes'
import { writeProcessRouteTrace } from './writeProcessRouteTrace'

/**
 * taskGroupId 独立选择 Task Worker；未声明时玩家仍回 uid 的 Event Worker。
 * bindId 只用于目标进程内的串行队列，不参与进程选择。
 *
 * 单独成模块是为了让这条链路**可被直接验证**：它的缺陷形态是「跨进程两侧各进一次幂等闸」，
 * 只在「监听进程 → 目标 worker」这条完整链路上才暴露——只测目标 worker 那一跳（
 * `native-lobby-multiprocess.test.ts` 的 `forward` 模式）永远看不到它。
 *
 * 装配一次即可（进程级钩子）；缺省不装，因此单进程下不会有第二条转发路径。
 */
export function installNativeLobbyProcessRouter(
    runtime: RuntimeServerLike,
    pipeTimeoutMs: number,
    options: {
        readonly resolvePlayerWorker?: typeof resolvePlayerWorker
    } = {},
): void {
    const playerWorker = options.resolvePlayerWorker ?? resolvePlayerWorker
    RouteAction.processRouter = async (call, routing) => {
        const sourceWorkerId = runtime.worker_id
        if (sourceWorkerId === null) throw new Error('action routing requires a worker process')
        const { taskGroupId, bindId } = routing
        // 匿名闭包没有可供目标进程重建的注册 handler。
        if (call.getApiName() === 'default/Default') {
            if (taskGroupId !== undefined) throw new Error('anonymous action cannot target a Task Worker')
            return false
        }
        let targetWorkerId: number
        if (taskGroupId !== undefined) {
            const taskWorkerNum = runtime.setting.task_worker_num
            if (taskWorkerNum === 0) {
                throw new Error(`action ${call.getApiName()} 声明 taskGroupId=${taskGroupId}，但 taskWorkerNum=0`)
            }
            targetWorkerId = runtime.setting.worker_num + (taskGroupId % taskWorkerNum)
        } else if (call.uId > 0) {
            targetWorkerId = await playerWorker(runtime, call.uId, call.messageHead.serverId ?? 0)
        } else {
            // 无玩家身份的命名 Action 默认在普通 Worker；后台 Task 发起时回到监听 Worker。
            targetWorkerId = sourceWorkerId < runtime.setting.worker_num ? sourceWorkerId : 0
        }
        if (sourceWorkerId === targetWorkerId) return false
        const request = buildRoutedRequest(call, routing)
        writeProcessRouteTrace({
            event: 'route',
            kind: request.kind,
            route: call.getApiName(),
            taskGroupId: taskGroupId ?? null,
            bindId: bindId ?? null,
            sourceWorkerId,
            targetWorkerId,
        })
        const outcome = (await runtime.requestMessage(request, targetWorkerId, pipeTimeoutMs)) as
            ProcessPipeOutcome | undefined
        await applyRoutedOutcome(call, outcome)
        return true
    }
}

/**
 * 把一次已解析的调用编码成进程间请求。
 *
 * 两项调度值都使用首次解析结果；RPC 配对留在持有连接的一端。
 */
function buildRoutedRequest(call: ApiCall, routing: ActionRouting): ProcessPipeRequest {
    const sid = call.messageHead.serverId ?? 0
    // IPC rejects explicit undefined values, including optional routing metadata.
    const metadata = {
        ...(routing.taskGroupId !== undefined ? { taskGroupId: routing.taskGroupId } : {}),
        ...(routing.bindId !== undefined ? { bindId: routing.bindId } : {}),
        traceId: call.messageHead.traceId,
        invokeLayer: call.messageHead.invokeLayer,
    }
    if (call.responseTransport !== 'object') {
        return {
            kind: 'routed-local-action',
            apiName: call.getApiName(),
            req: call.req,
            uid: call.uId,
            sid,
            ...metadata,
            ...(call.backgroundTask ? { backgroundTask: call.backgroundTask } : {}),
        }
    }
    const externalUid = (call as ObjectActionCall<unknown, unknown>).externalUid
    if (!externalUid) throw new Error(`routed object route without a trusted external uid: ${call.getApiName()}`)
    return {
        kind: 'routed-lobby-route',
        route: call.getApiName(),
        payload: call.req,
        uid: externalUid,
        internalUid: call.uId,
        sid,
        ...metadata,
    }
}

/**
 * 把目标 worker 的对象结果回放到源调用上。
 *
 * 失败必须原样回放字符串错误码：只用 ErrorData 会把 shared 合法字符串码降级成数字 0，
 * 持有连接的一端就只能回 INTERNAL，业务失败被误判成服务端内部错误。
 */
async function applyRoutedOutcome(call: ApiCall, outcome: ProcessPipeOutcome | undefined) {
    if (!outcome || outcome.ok !== true) {
        const failure =
            outcome && outcome.ok === false ? outcome.err : { code: 'INTERNAL', msg: '跨进程调用未返回结果' }
        call.failureCause = { code: failure.code, msg: failure.msg }
        await call.error({ code: 0, message: failure.msg, noLogin: failure.noLogin })
        return
    }
    const result = outcome.res
    if (isLobbyRouteOutcome(result)) {
        call.syncForReply = result.sync
        await call.succ(result.data)
        return
    }
    await call.succ(result ?? {})
}
