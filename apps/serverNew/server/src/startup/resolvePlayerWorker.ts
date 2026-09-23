import { PlayerWorkerOwner, UserOnlineMgr } from '@arthropoda/game-engine'
import type { RuntimeServerLike } from './runtimeTypes'

/** 玩家写入只落 Event Worker；Task Worker 只能把结果作为玩家事件送回这里。 */
export async function resolvePlayerWorker(runtime: RuntimeServerLike, uid: number, sid: number): Promise<number> {
    const workerNum = runtime.setting.worker_num
    if (!Number.isInteger(workerNum) || workerNum <= 0) throw new Error('player routing requires Event Workers')

    const online = await UserOnlineMgr.get(uid, sid)
    let candidate = validEventWorkerId(online?.workerId, workerNum)
    if (candidate === undefined && online && online.connectionId > 0) {
        const connectionOwner = runtime.connection_owner(online.connectionId)
        candidate = validEventWorkerId(connectionOwner, workerNum)
    }
    candidate ??= PlayerWorkerOwner.preferred(uid, workerNum)

    const owner = await PlayerWorkerOwner.claim(uid, sid, workerNum, candidate)
    if (online && online.workerId !== owner) {
        await UserOnlineMgr.setWorkerOwner(uid, sid, online.connectionId, owner)
    }
    return owner
}

function validEventWorkerId(workerId: unknown, workerNum: number): number | undefined {
    return Number.isInteger(workerId) && (workerId as number) >= 0 && (workerId as number) < workerNum
        ? (workerId as number)
        : undefined
}
