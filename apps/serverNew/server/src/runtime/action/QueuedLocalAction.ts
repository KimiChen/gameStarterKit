import {
    Call,
    E_APP_TYPE,
    MessageHelper,
    RedisInstance,
    Url,
    getServerIdByUid,
    timestamp,
} from '@arthropoda/game-engine'
import { Actions } from '../../../generated/protocol/server/S2S/actions'
import { FixedServerEndpoint } from '../../http/FixedServerEndpoint'
import { ServerListProxy } from '../../modules/serverSettings/persistence/ServerListProxy'
import { SystemErrors } from '../errors/SystemErrors'
import { LocalAction } from './LocalAction'
import { RpcAttachTask } from './RpcAttachTask'

interface LocalQueueItem {
    apiName: string
    uId: int
    sId: int
    req: any
}

type ActionClass = (typeof Actions)[keyof typeof Actions]
type ActionClassReq<T extends ActionClass> = Parameters<InstanceType<T>['doAction']>[0]

export class QueuedLocalAction {
    static timerQueueKey(sid: number) {
        return `game.localTimeQueue:${sid}`
    }

    static async rpc<T extends ActionClass>(actionClass: T, req: ActionClassReq<T>, uId: int, sid: int, time: int = 0) {
        const items = (await this.resolveTargetSids(req, uId, sid)).map((targetSid) =>
            this.createItem(actionClass, this.scopeRequest(req, targetSid), uId, targetSid),
        )
        const callback = async () => {
            for (const item of items) {
                if (time <= 0) {
                    await this.dispatchImmediate(item)
                    continue
                }
                if (APP_TYPE !== E_APP_TYPE.SERVICE || item.sId !== SERVER_ID) {
                    throw new Error(`delayed local action must target current fixed server: sid=${item.sId}`)
                }
                await RedisInstance.getCenterRedis().zAdd(this.timerQueueKey(item.sId), time, JSON.stringify(item))
            }
        }
        if (!RpcAttachTask.tryRegisterCB(callback)) {
            await callback()
        }
    }

    static async delTimerRpc<T extends ActionClass>(actionClass: T, req: ActionClassReq<T>, uId: int, sid: int) {
        const item = this.createItem(actionClass, req, uId, sid || SERVER_ID)
        const callback = async () => {
            await RedisInstance.getCenterRedis().zRem(this.timerQueueKey(item.sId), JSON.stringify(item))
        }
        if (!RpcAttachTask.tryRegisterCB(callback)) {
            await callback()
        }
    }

    static async recvTimeQueue() {
        const redis = RedisInstance.getCenterRedis()
        const queueKey = this.timerQueueKey(SERVER_ID)
        const members = await redis.zRangeWithScores(queueKey, 0, 0)
        for (const { score, value } of members) {
            if (score > timestamp()) {
                break
            }
            if ((await redis.zRem(queueKey, value)) <= 0) {
                continue
            }
            const item = JSON.parse(value) as LocalQueueItem
            if (item.sId !== SERVER_ID) {
                throw new Error(`delayed local action sid mismatch: expected=${SERVER_ID}, actual=${item.sId}`)
            }
            await this.callLocal(item)
        }
    }

    private static async dispatchImmediate(item: LocalQueueItem) {
        if (APP_TYPE === E_APP_TYPE.SERVICE) {
            if (item.sId !== SERVER_ID) {
                throw new Error(`local action sid mismatch: expected=${SERVER_ID}, actual=${item.sId}`)
            }
            await this.callLocal(item)
            return
        }

        const url = FixedServerEndpoint.internalActionUrl(item.sId)
        if (!url) {
            throw new Error(`fixed server endpoint not found: sid=${item.sId}`)
        }
        const response = await Url.postJson(
            url,
            {
                type: 'localAction',
                actionParams: item,
            },
            undefined,
            {
                'x-internal-secret': CP.platform.gmSecret ?? '',
            },
        )
        if (response.status !== 200 || response.data?.code !== 0) {
            throw new Error(`fixed server local action failed: sid=${item.sId}, api=${item.apiName}`)
        }
    }

    private static async callLocal(item: LocalQueueItem) {
        const result = await MessageHelper.callLocalAction(item.uId, item.sId, new Call(item.apiName, item.req))
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
}
