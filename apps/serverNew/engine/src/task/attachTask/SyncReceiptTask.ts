import { ModSync } from '../../mod/ModSync'
import { IEngineAttachTask } from '../IAttachTask'
import { ServerTask } from '../ServerTask'

/** Redis 成功提交后冻结本次 Action 的 Bean diff；网络投递由宿主决定。 */
export class SyncReceiptTask implements IEngineAttachTask {
    constructor(private readonly serverTask: ServerTask) {}

    async onStart() { return }

    async onActionSuccess() {
        const changes = ModSync.autoGetModChanged()
        if (changes) {
            for (const [rawUid, mods] of Object.entries(changes)) {
                const uid = Number(rawUid)
                if (Number.isSafeInteger(uid) && uid > 0) this.serverTask.call!.appendSyncChange(uid, mods)
            }
        }
        await ModSync.notifyCommitted(changes, this.serverTask.call)
    }

    async onActionError() { return }

    async onClear() { return }
}
