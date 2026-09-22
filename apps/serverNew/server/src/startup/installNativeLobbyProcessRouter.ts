import { isLobbyRouteOutcome, RouteAction, type ApiCall, type ObjectActionCall } from '@arthropoda/game-engine'
import type { ProcessPipeOutcome, ProcessPipeRequest } from './processPipe'
import type { RuntimeServerLike } from './runtimeTypes'
import { writeProcessRouteTrace } from './writeProcessRouteTrace'

/**
 * 把「对象调用按 bindId 转到 task worker」装进 `RouteAction.processRouter`。
 *
 * 单独成模块是为了让这条链路**可被直接验证**：它的缺陷形态是「跨进程两侧各进一次幂等闸」，
 * 只在「监听进程 → 目标 worker」这条完整链路上才暴露——只测目标 worker 那一跳（
 * `native-lobby-multiprocess.test.ts` 的 `forward` 模式）永远看不到它。
 *
 * 装配一次即可（进程级钩子）；缺省不装，因此单进程下不会有第二条转发路径。
 */
export function installNativeLobbyProcessRouter(runtime: RuntimeServerLike, pipeTimeoutMs: number): void {
    RouteAction.processRouter = async (call, bindId) => {
        // `RouteAction` 同时服务原生 Lobby 的对象调用与 `MessageHelper` 的进程内 LocalAction。
        // 后者没有可信外部 uid，也不应借「routed-lobby-route」绕过它自己的调度语义：例如认证
        // 成功后的 `user.lobbyEnter` 必须在持有连接的 worker 里完成，才能继续同一条登录链。
        if (call.responseTransport !== 'object') return false

        // `user-task` 管道已经把这次 LocalAction 投递到按 uid 选出的 USER_TASK_WORKER。
        // 该进程再按 ActionUser 的 bindId 转去普通 task worker，不但违背用户任务所有权，
        // 还会因 LocalAction 没有对象 response transport 被 fail-closed。user task worker 是这类
        // 调用的最终落点，必须就地执行。
        if (
            runtime.worker_id !== null &&
            runtime.worker_id >= runtime.setting.worker_num + runtime.setting.task_worker_num
        ) {
            return false
        }
        const taskWorkerNum = runtime.setting.task_worker_num
        if (taskWorkerNum === 0) {
            throw new Error(`action ${call.getApiName()} 声明 bindId=${bindId}，但 taskWorkerNum=0`)
        }
        const targetWorkerId = runtime.setting.worker_num + (bindId % taskWorkerNum)
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
    // 非对象调用是本地 Action，调用方必须保持就地执行（见 router 顶层的短路）。这里再留一层
    // 防御，避免将来复用本函数时把内部 Action 错编码成原生 Lobby 管道请求。
    if (call.responseTransport !== 'object') return undefined
    const externalUid = (call as ObjectActionCall<unknown, unknown>).externalUid
    if (!externalUid) {
        throw new Error(`routed object route without a trusted external uid: ${call.getApiName()}`)
    }
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
