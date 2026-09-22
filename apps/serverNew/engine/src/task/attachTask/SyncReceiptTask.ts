import { ModSync } from '../../mod/ModSync'
import { IEngineAttachTask } from '../IAttachTask'
import { ServerTask } from '../ServerTask'

/** Redis 成功提交后冻结本次 Action 的 Bean diff；网络投递由宿主决定。 */
export class SyncReceiptTask implements IEngineAttachTask {
    /** 提交前冻结的变更；提交后由 `onActionSuccess` 投递给跨玩家订阅者。 */
    private frozenChanges: { [key: int]: { [key: string]: any } } | undefined

    constructor(private readonly serverTask: ServerTask) {}

    async onStart() { return }

    /**
     * 提交前冻结本次 Action 的 Bean 差异。
     *
     * ⛔ 这一步**不能**挪进 `onActionSuccess`：`RedisTask` 的 `RedisService.save()` 会逐个调
     * `Hash.save()`，而它在 `finally` 里执行 `super.save()` → `initDiff()`，把 `diff.status`
     * 置成 `None` 并清空 `diff.changes`。此后 `toModData(true)` 一律返回 `null`，`getModData`
     * 对每个 Bean 直接跳过，`autoGetModChanged()` 只会回一个**空对象** —— 于是 Bean 路径的
     * `reply.sync` 永远缺席（只有显式 store 主动调 `recordObjectActionSync` 的路由才有）。
     *
     * 本方法只读内存里的 diff，不碰 Redis；持久化仍由 `RedisTask` 完成。失败按 fail-closed
     * 冒泡：此时尚未提交，让整个 Action 失败比「已提交但客户端永远收不到变更」安全。
     */
    async onBeforeCommit() {
        const changes = ModSync.autoGetModChanged()
        this.frozenChanges = changes
        if (!changes) return
        for (const [rawUid, mods] of Object.entries(changes)) {
            const uid = Number(rawUid)
            if (Number.isSafeInteger(uid) && uid > 0) this.serverTask.call!.appendSyncChange(uid, mods)
        }
    }

    async onActionSuccess() {
        // 本方法跑在 ServerTask 的提交临界区里（RedisTask 已经落盘、`committed` 还没置位），
        // 因此主动同步投递**必须**是提交后的 best-effort：异常冒泡会把「已提交」改写成业务失败，
        // 客户端重试就会把同一笔业务再做一遍。请求者自己的数据此时已经登记到 reply.sync，
        // 与这条投递无关。
        try {
            await ModSync.notifyCommitted(this.frozenChanges, this.serverTask.call)
        } catch (error) {
            Log.error(`apiName:${this.serverTask.call?.getApiName()}, post-commit sync delivery failed`, error)
        } finally {
            this.frozenChanges = undefined
        }
    }

    async onActionError() {
        this.frozenChanges = undefined
    }

    async onClear() {
        this.frozenChanges = undefined
    }
}
