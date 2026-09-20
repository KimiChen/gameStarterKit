import { IEngineAttachTask } from '../IAttachTask'
import { GameError } from '../../error/GameError'
import { ErrorData } from '../../error/ErrorData'
import { ServerTask } from '../ServerTask'

/**
 * 响应出口。
 *
 * ⛔ 不向业务响应附加 `_mod`：响应只承载业务自己声明的字段，客户端能看到什么由协议声明决定。
 * 变更数据的通知由所属模块通过 shared 声明的领域推送显式发送（`guild.event` / `mail.new` 等），
 * 可恢复读面走领域查询；框架不再提供任何隐式推送出口。
 */
export class NetTask implements IEngineAttachTask {
    serverTask: ServerTask

    private platform: string[] = ['bearjoy']

    constructor(serverTask: ServerTask) {
        this.serverTask = serverTask
    }

    /** 业务开始时调用；响应出口不持有任何连接级状态。 */
    async onStart() {
        return
    }

    /** 业务已经持久化成功后调用 */
    async onActionSuccess(res: any) {
        await this.serverTask.call?.succ(res)
    }

    /** 业务失败后调用 */
    async onActionError(e: Error) {
        if (this.serverTask.call) this.serverTask.call.failureCause = e
        let item: ErrorData
        if (e instanceof GameError) {
            item = e.getItem()
        } else {
            item = GameError.logicError.getItem()
        }
        if (!this.platform.find((f) => f === PLATFORM)) {
            item.vars = []
        }
        await this.serverTask.call?.error(item)
    }

    /** 最后调用,用于清理 */
    async onClear() {
        return
    }
}
