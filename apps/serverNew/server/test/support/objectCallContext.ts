import { ObjectActionCall } from '@arthropoda/game-engine'
import { ContextEngine } from '../../../engine/src/context/ContextEngine'

/** 一次「最小对象调用」的执行结果。 */
export interface ObjectCallRun<T> {
    readonly value: T
    /** 本次调用上登记的同步变更，键是内部 uid（`recordObjectActionSync` 的登记结果）。 */
    readonly syncChanges: Readonly<Record<number, unknown>>
}

/**
 * 在「对象路由调用」上下文里执行回调。
 *
 * 显式 store（例如 `NativeLobbyUserStore`）写完中心 Redis 后必须把变更登记到**当前对象调用**上，
 * 否则本次响应既没有 `reply.sync`，也不会被主动 sync 带走。框架对这个前提是 fail-fast 的：
 * 没有对象调用上下文直接抛错。
 *
 * 所以测试要脱离路由层单独验证 store 语义时，用这个最小对象调用占位建立上下文。
 * ⛔ 不要为了让测试通过把生产代码改回静默忽略 —— 那样「数据已提交、客户端永远不知道」
 * 会重新变成不可观测的静默失败。
 *
 * 从 `engine/src` 直接取可变 `ContextEngine` 类，与 `FakeCenterRedis` 取真实 `RedisInstance`
 * 同理：公开入口导出的是只读门面 `ContextEngineExport`，它只给业务读当前上下文，
 * 不提供「建立上下文」的能力 —— 测试夹具需要这个能力，业务代码不需要。
 */
export async function runInObjectCall<T>(
    identity: { readonly uid: number; readonly sId: number },
    run: () => Promise<T>,
): Promise<ObjectCallRun<T>> {
    const engine = new ContextEngine()
    const call = new ObjectActionCall<unknown, unknown>(
        'test.objectCallContext',
        {},
        {},
        { doAction: () => undefined },
        identity,
    )
    engine.ctxLogic.call = call
    const value = await ContextEngine.asyncLocalStorage.run(engine, run)
    return { value, syncChanges: call.syncChanges ?? {} }
}
