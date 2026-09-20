import { RedisService } from '../../differ/RedisService'
import { IEngineAttachTask } from '../IAttachTask'

export class RedisTask implements IEngineAttachTask {
    /** 业务开始时调用 */
    async onStart() {
        return
    }

    /** 业务成功后调用 */
    async onActionSuccess(res: any) {
        return RedisService.save()
    }

    /** 业务失败后调用 */
    async onActionError(e: Error) {
        return
    }

    /** 最后调用,用于清理 */
    async onClear() {
        return
    }
}
