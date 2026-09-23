import { createHash, randomUUID } from 'node:crypto'
import {
    Call,
    ContextEngine,
    E_APP_TYPE,
    MessageHelper,
    RedisInstance,
    getServerIdByUid,
    timestamp,
} from '@arthropoda/game-engine'
import { Actions } from '../../../generated/protocol/server/S2S/actions'
import { ServerListProxy } from '../../modules/serverSettings/persistence/ServerListProxy'
import { SystemErrors } from '../errors/SystemErrors'
import { LocalAction } from './LocalAction'
import { RpcAttachTask } from './RpcAttachTask'
import { QueuedLocalActionRecord, QueuedLocalActionStore } from './QueuedLocalActionStore'

interface LocalQueueItem {
    apiName: string
    uId: int
    sId: int
    req: any
}

export interface QueuedLocalActionOptions {
    /** 业务持久状态中的稳定操作号；生产者重试时复用它即可幂等登记。 */
    readonly taskId?: string
}

type ActionClass = (typeof Actions)[keyof typeof Actions]
type ActionClassReq<T extends ActionClass> = Parameters<InstanceType<T>['doAction']>[0]

export class QueuedLocalAction {
    private static readonly consumerId = `${process.pid}:${randomUUID()}`

    static timerQueueKey(sid: number) {
        return `game.localTimeQueue:${sid}`
    }

    static async rpc<T extends ActionClass>(
        actionClass: T,
        req: ActionClassReq<T>,
        uId: int,
        sid: int,
        time: int = 0,
        options?: QueuedLocalActionOptions,
    ): Promise<string[]> {
        if (!Number.isFinite(time) || time < 0) throw new Error(`invalid queued local action time: ${time}`)
        const items = (await this.resolveTargetSids(req, uId, sid)).map((targetSid) =>
            this.createItem(actionClass, this.scopeRequest(req, targetSid), uId, targetSid),
        )
        const baseTaskId = this.validateTaskId(options?.taskId ?? randomUUID())
        const taskIds = items.map((item) =>
            this.validateTaskId(items.length === 1 ? baseTaskId : `${baseTaskId}:${item.sId}`),
        )
        const callback = async () => {
            for (let index = 0; index < items.length; index += 1) {
                const item = items[index]
                await QueuedLocalActionStore.enqueue(
                    this.createRecord(taskIds[index], item, Math.max(time, timestamp())),
                )
            }
        }
        if (!RpcAttachTask.tryRegisterCB(callback)) {
            await callback()
        }
        return taskIds
    }

    static async delTimerRpc<T extends ActionClass>(actionClass: T, req: ActionClassReq<T>, uId: int, sid: int) {
        const item = this.createItem(actionClass, req, uId, sid || SERVER_ID)
        const callback = async () => {
            // 兼容迁移前的队列成员。
            await RedisInstance.getCenterRedis().zRem(this.timerQueueKey(item.sId), JSON.stringify(item))
            const fingerprint = this.fingerprint(item)
            const keys = QueuedLocalActionStore.keys(item.sId)
            const records = await RedisInstance.getCenterRedis().hGetAll(keys.tasks)
            for (const [taskId, raw] of Object.entries(records)) {
                let record: QueuedLocalActionRecord
                try {
                    record = JSON.parse(raw) as QueuedLocalActionRecord
                } catch {
                    continue
                }
                if (record.state === 'pending' && record.fingerprint === fingerprint) {
                    await QueuedLocalActionStore.cancel(taskId, item.sId)
                }
            }
        }
        if (!RpcAttachTask.tryRegisterCB(callback)) {
            await callback()
        }
    }

    static async recvTimeQueue() {
        const now = timestamp()
        const claimOwner = `${this.consumerId}:${randomUUID()}`
        const record = await QueuedLocalActionStore.claim(
            SERVER_ID,
            claimOwner,
            randomUUID(),
            `legacy:${randomUUID()}`,
            now,
        )
        if (!record) return undefined
        if (record.sId !== SERVER_ID) {
            await QueuedLocalActionStore.fail(
                record,
                claimOwner,
                new Error(`delayed local action sid mismatch: expected=${SERVER_ID}, actual=${record.sId}`),
                now,
            )
            return record
        }
        const heartbeat = setInterval(
            () => {
                QueuedLocalActionStore.renew(record, claimOwner).then(
                    (renewed) => {
                        if (!renewed) Log.error(`queued local action lease lost taskId=${record.taskId}`)
                    },
                    (error) => Log.error(`queued local action lease renew failed taskId=${record.taskId}`, error),
                )
            },
            Math.floor(QueuedLocalActionStore.LEASE_MS / 3),
        )
        heartbeat.unref?.()
        try {
            await this.callLocal(record)
            if (!(await QueuedLocalActionStore.ack(record, claimOwner, timestamp()))) {
                Log.error(`queued local action ack lost ownership taskId=${record.taskId}`)
            }
        } catch (error) {
            const outcome = await QueuedLocalActionStore.fail(record, claimOwner, error, timestamp())
            Log.error(`queued local action failed taskId=${record.taskId} outcome=${outcome}`, error)
        } finally {
            clearInterval(heartbeat)
        }
        return record
    }

    private static async callLocal(item: QueuedLocalActionRecord) {
        const result = await MessageHelper.callLocalAction(
            item.uId,
            item.sId,
            new Call(item.apiName, item.req as Record<string, unknown>, {
                taskId: item.taskId,
                attempt: item.attempts,
            }),
        )
        if (!result.isSucc) {
            throw result.res ?? new Error(result.errMsg ?? `local action failed: ${item.apiName}`)
        }
    }

    private static async resolveTargetSids(req: any, uId: int, sid: int): Promise<number[]> {
        if (sid > 0) {
            return [sid]
        }
        if (uId > 0) {
            return [getServerIdByUid(uId)]
        }
        if (APP_TYPE === E_APP_TYPE.SERVICE) {
            return [SERVER_ID]
        }
        const requestSids = req?.sIds ?? req?.serverIds
        const sids =
            Array.isArray(requestSids) && requestSids.length > 0
                ? requestSids.map(Number)
                : await ServerListProxy.getAllSid()
        return [...new Set(sids.filter((item) => Number.isInteger(item) && item > 0))]
    }

    private static scopeRequest(req: any, targetSid: number) {
        if (!req || typeof req !== 'object') {
            return req
        }
        if (Array.isArray(req.sIds)) {
            return { ...req, sIds: [targetSid] }
        }
        if (Array.isArray(req.serverIds)) {
            return { ...req, serverIds: [targetSid] }
        }
        return req
    }

    private static createItem<T extends ActionClass>(
        actionClass: T,
        req: ActionClassReq<T>,
        uId: int,
        sId: int,
    ): LocalQueueItem {
        const apiName = LocalAction.getAction2ApiName(actionClass)
        if (!apiName) {
            throw SystemErrors.SysComponentErr.vars([actionClass.name])
        }
        return { apiName, uId, sId, req }
    }

    /** 当前可靠任务身份；业务写入可用 taskId 作为幂等操作号。 */
    static currentTask() {
        return ContextEngine.currentCtxEngine?.ctxLogic.backgroundTask
    }

    static cancel(taskId: string, sid: number = SERVER_ID) {
        return QueuedLocalActionStore.cancel(this.validateTaskId(taskId), sid)
    }

    static failed(sid: number = SERVER_ID, limit = 100) {
        return QueuedLocalActionStore.failed(sid, limit)
    }

    private static createRecord(taskId: string, item: LocalQueueItem, availableAt: number): QueuedLocalActionRecord {
        const now = timestamp()
        return {
            version: 2,
            taskId,
            fingerprint: this.fingerprint(item),
            apiName: item.apiName,
            uId: item.uId,
            sId: item.sId,
            req: item.req,
            createdAt: now,
            availableAt,
            attempts: 0,
            state: 'pending',
        }
    }

    private static fingerprint(item: LocalQueueItem): string {
        return createHash('sha256').update(this.stableStringify(item)).digest('hex')
    }

    private static stableStringify(value: unknown): string {
        const normalize = (item: unknown): unknown => {
            if (Array.isArray(item)) return item.map(normalize)
            if (!item || typeof item !== 'object') return item
            const source = item as Record<string, unknown>
            const result: Record<string, unknown> = {}
            for (const key of Object.keys(source).sort()) {
                if (source[key] !== undefined) result[key] = normalize(source[key])
            }
            return result
        }
        return JSON.stringify(normalize(value))
    }

    private static validateTaskId(taskId: string): string {
        if (!/^[A-Za-z0-9._:-]{1,160}$/.test(taskId)) {
            throw new Error(`invalid queued local action taskId: ${taskId}`)
        }
        return taskId
    }
}
