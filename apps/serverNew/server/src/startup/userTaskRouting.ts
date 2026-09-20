import type { RuntimeServerLike } from './runtimeTypes'
import type { ProcessPipeOutcome, ProcessPipeRequest } from './processPipe'
import { writeProcessRouteTrace } from './writeProcessRouteTrace'

/**
 * 用户维度任务的落点判定：`uid` → user task worker 槽位。
 *
 * 单独成模块的理由与 `lobbyRole.ts` 相同：它是「一次用户任务落在哪个进程」的**唯一**判定点，
 * 而判错的表现本地都看不出来——哈希退化成常量会让所有用户任务挤在同一个槽位上（功能照常、
 * 扩容完全失效），槽位算错则指到一个不存在的进程上（请求超时）。两种都必须能在**不真的起
 * 多进程**的情况下被直接验证，因此依赖全部经参数注入。
 */

/**
 * uid → 32 位无符号哈希（FNV-1a）。
 *
 * 只用整数运算，且 `Math.imul` 保证 32 位截断：跨进程、跨 Node 版本结果一致。
 * ⛔ 不要换成 `uid % n`：引擎的内部 uid 是**自增**分配的，直接取余会把连续的一段用户整体压到
 * 同一个槽位上——分布看起来是「每个槽位都非空」，但负载极不均匀，而这正是最容易漏过自检的形态。
 */
export function hashUserId(uid: number): number {
    let hash = 0x811c9dc5
    const text = String(uid)
    for (let index = 0; index < text.length; index += 1) {
        hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193)
    }
    // 转无符号：负数取余会得到负的槽位偏移，指到池外的进程上。
    return hash >>> 0
}

/** user task worker 槽位区间的起点；与 alloy-core 的 `toGlobalUserTaskWorkerId` 同形。 */
export function firstUserTaskWorkerId(setting: RuntimeServerLike['setting']): number {
    return setting.worker_num + setting.task_worker_num
}

/**
 * 用户任务的落点；返回 `undefined` 表示**本进程不转发**、调用方应当就地执行。
 *
 * 三种 `undefined` 都不是异常，而是合法的「就地执行」结论：
 * - 没有配置 user task 池（`user_task_worker_num` 为 0）——单进程与「只有 task worker」的拓扑都走这里；
 * - `uid` 不是正整数——没有用户维度，谈不上按用户路由；
 * - 算出来的槽位就是本进程——再发一条管道请求只是多一轮序列化，并把失败面扩大一圈。
 */
export function userTaskWorkerFor(setting: RuntimeServerLike['setting'], uid: number): number | undefined {
    const total = setting.user_task_worker_num ?? 0
    if (!Number.isInteger(total) || total <= 0) return undefined
    if (!Number.isInteger(uid) || uid <= 0) return undefined
    return firstUserTaskWorkerId(setting) + (hashUserId(uid) % total)
}

/** 一次用户维度的 LocalAction；`uid` 必须是引擎内部数值 uid，不是原生 Lobby 的外部字符串 uid。 */
export interface UserTaskRequest {
    readonly apiName: string
    readonly req: unknown
    readonly uid: number
    readonly sid: number
}

/**
 * 把一次用户维度的 LocalAction 发到它该去的 user task worker。
 *
 * 返回 `undefined` 表示**没有转发**（没有池、没有 uid，或落点就是本进程），调用方就地执行；
 * 返回管道结果表示转发已经发生，由调用方决定怎么把失败暴露出去。
 *
 * 痕迹打在 `requestMessage` **之前**：转发超时或目标进程已退出时，「谁试图发给谁」仍然要留下。
 * 但它只能证明**发起了转发**——「目标真的执行了」必须由目标进程自己留痕（见 `processPipe` 的
 * `user-task` 分支），两者缺一不可。
 */
export async function routeUserTask(
    runtime: RuntimeServerLike,
    request: UserTaskRequest,
    pipeTimeoutMs: number,
): Promise<ProcessPipeOutcome | undefined> {
    const targetWorkerId = userTaskWorkerFor(runtime.setting, request.uid)
    if (targetWorkerId === undefined) return undefined
    if (runtime.worker_id === targetWorkerId) return undefined
    const message: ProcessPipeRequest = {
        kind: 'user-task',
        apiName: request.apiName,
        req: request.req,
        uid: request.uid,
        sid: request.sid,
    }
    writeProcessRouteTrace({
        event: 'route',
        kind: message.kind,
        route: request.apiName,
        uid: request.uid,
        sourceWorkerId: runtime.worker_id,
        targetWorkerId,
    })
    return (await runtime.requestMessage(message, targetWorkerId, pipeTimeoutMs)) as ProcessPipeOutcome | undefined
}
