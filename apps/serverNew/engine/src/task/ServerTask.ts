import { ContextEngine } from '../context/ContextEngine'
import { GameError } from '../error/GameError'
import { ApiCall } from '../net/client/base/ApiCall'
import { timestamp } from '../utils/common'
import { IActionAttachTask, IEngineAttachTask } from './IAttachTask'
import { EventActionTask } from './attachTask/EventActionTask'
import { NetTask } from './attachTask/NetTask'
import { RedisTask } from './attachTask/RedisTask'
import { SyncReceiptTask } from './attachTask/SyncReceiptTask'

export class ServerTask {
    /** 所有的其他任务 */
    attachTasks: IEngineAttachTask[] = []

    actionAttachTasks: IActionAttachTask[] = []

    private netTask!: NetTask

    static templateActionAttackTasks: { new (): IActionAttachTask }[] = []

    call?: ApiCall

    /** 上下文，如果一个任务因为资源竞争重新执行时，要考虑要不要重新初始化 */
    ctx: ContextEngine

    constructor() {
        this.initAttachTasks()
        this.ctx = new ContextEngine()
    }

    initAttachTasks() {
        // 先完成 Redis 提交，NetTask 再发送成功响应。
        this.attachTasks.push(new RedisTask())
        this.attachTasks.push(new SyncReceiptTask(this))
        this.netTask = new NetTask(this)
        this.actionAttachTasks.push(new EventActionTask())
        for (const task of ServerTask.templateActionAttackTasks) {
            this.actionAttachTasks.push(new task())
        }
    }

    static addActionAttackTask(task: new () => IActionAttachTask) {
        ServerTask.templateActionAttackTasks.push(task)
    }

    async doAction() {
        let committed = false
        try {
            try {
                //开始执行任务时,调用一次获取时间,里面的时间缓存逻辑让整个生命周期中时间不变
                timestamp()
                const ctx = ContextEngine.currentCtxEngine!.ctxLogic
                // 在上下文中保存一份
                ctx.call = this.call
                //uid sid等改到上下文中自己获取
                for (const attach of [...this.attachTasks, this.netTask, ...this.actionAttachTasks]) {
                    await attach.onStart()
                }
                await this.call?.actionBefore()
                const res = await this.call?.doAction()
                //例如邮件业务为了规范写法和提升批量发送效率, 在等常规业务结束统一处理,此时需要等待该业务结束再清理bean缓存
                for (const attach of this.actionAttachTasks) {
                    await attach.onDoAction(res)
                }
                for (const attach of this.attachTasks) {
                    await attach.onActionSuccess(res)
                }
                committed = true
            } catch (e) {
                if (e instanceof GameError) {
                    Log.exception.info(`apiName:${this.call?.getApiName()},%s`, e.getDebugStr())
                } else {
                    Log.error(`apiName:${this.call?.getApiName()},%s`, e)
                }
                await this.netTask.onActionError(e as Error)
                for (const attach of this.attachTasks) {
                    await attach.onActionError(e as Error)
                }
            }
            if (committed) {
                await this.runAfterCommit()
            }
        } catch (e) {
            Log.error(e)
            this.call
                ?.error(GameError.logicError.vars(['doAction', this.call.getApiName()]).getItem())
                .catchError('ServerTask.ts#1:')
        } finally {
            await this.clear()
        }
    }

    /** Redis 已提交后的失败不能再改变本次 Action 的响应结果。 */
    private async runAfterCommit() {
        try {
            await this.netTask.onActionSuccess(this.call?.res)
        } catch (error) {
            Log.error(`apiName:${this.call?.getApiName()}, post-commit response failed`, error)
        }
        for (const attach of this.actionAttachTasks) {
            try {
                await attach.onEngineEnd()
            } catch (error) {
                Log.error(`apiName:${this.call?.getApiName()}, post-commit task failed`, error)
            }
        }
    }

    private async clear() {
        try {
            await this.netTask.onClear()
        } catch (error) {
            Log.error(`apiName:${this.call?.getApiName()}, NetTask clear failed`, error)
        }
        for (const attach of this.attachTasks) {
            try {
                await attach.onClear()
            } catch (error) {
                Log.error(`apiName:${this.call?.getApiName()}, attach task clear failed`, error)
            }
        }
    }
}
