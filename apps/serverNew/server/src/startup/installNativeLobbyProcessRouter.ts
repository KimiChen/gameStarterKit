import { isLobbyRouteOutcome, RouteAction, type ApiCall, type ObjectActionCall } from '@arthropoda/game-engine'
import type { ProcessPipeOutcome, ProcessPipeRequest } from './processPipe'
import { resolvePlayerWorker } from './resolvePlayerWorker'
import type { RuntimeServerLike } from './runtimeTypes'
import { writeProcessRouteTrace } from './writeProcessRouteTrace'

/**
 * 玩家 Action 落到 uid 的 Event Worker；非玩家资源 Action 继续按 bindId 落普通 Task Worker。
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
    RouteAction.processRouter = async (call, bindId) => {
        let targetWorkerId: number
        if (call.uId > 0 && bindId === call.uId) {
            targetWorkerId = await playerWorker(runtime, call.uId, call.messageHead.serverId ?? 0)
        } else {
            const taskWorkerNum = runtime.setting.task_worker_num
            if (taskWorkerNum === 0) {
                throw new Error(`action ${call.getApiName()} 声明非玩家 bindId=${bindId}，但 taskWorkerNum=0`)
            }
            targetWorkerId = runtime.setting.worker_num + (bindId % taskWorkerNum)
        }
        if (runtime.worker_id === targetWorkerId) return false
        const request = buildRoutedRequest(call, bindId)
        if (!request) return false
        writeProcessRouteTrace({
            event: 'route',
            kind: request.kind,
            route: call.getApiName(),
            bindId,
            sourceWorkerId: runtime.worker_id,
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
 * 只带字符串路由、业务 payload、可信身份与首次解析的 bindId；⛔ 不带客户端原始帧，也不在
 * 目标 worker 重算 bindId。RPC 请求配对由持有连接的一端完成，因此配对 id 不需要跨进程。
 */
function buildRoutedRequest(call: ApiCall, bindId: number): ProcessPipeRequest | undefined {
    const sid = call.messageHead.serverId ?? 0
    // 本地队列占位路由（`default/Default`）没有业务语义，就地执行即可。
    if (call.getApiName() === 'default/Default') return undefined
    if (call.responseTransport !== 'object') {
        return {
            kind: 'routed-local-action',
            apiName: call.getApiName(),
            req: call.req,
            uid: call.uId,
            sid,
            bindId,
            traceId: call.messageHead.traceId,
            invokeLayer: call.messageHead.invokeLayer,
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
        bindId,
        traceId: call.messageHead.traceId,
        invokeLayer: call.messageHead.invokeLayer,
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
