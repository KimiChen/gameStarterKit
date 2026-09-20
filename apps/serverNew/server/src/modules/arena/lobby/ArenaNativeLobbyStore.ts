import { RedisInstance, RedisLock } from '@arthropoda/game-engine'
import {
    ARENA_MAX_POWER,
    ARENA_TILE_COUNT,
    canCaptureTile,
    fillArenaBoard,
    type IArenaTile,
} from '../../../../generated/lobby-contract/kits/arena/api/board/index'
import type {
    IArenaBoardRes,
    IArenaCaptureReq,
    IArenaCaptureRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/arena'

/**
 * arena 的权威 Redis 读写面。capture 回执按 uid/sId/clientReqId 保存，
 * 因而同一幂等键改 payload 会稳定冲突，重试不重复增加奖杯。
 */
export class ArenaNativeLobbyStore {
    private static readonly tilesKey = 'nativeLobby:arena:tiles:v1'
    private static readonly trophiesKey = 'nativeLobby:arena:trophies:v1'
    private static readonly operationsKey = 'nativeLobby:arena:operations:v1'

    async board(uid: string, sId: number): Promise<IArenaBoardRes> {
        return { tiles: await this.readBoard(sId), myTrophies: await this.trophies(uid, sId) }
    }

    async capture(uid: string, sId: number, request: IArenaCaptureReq): Promise<IArenaCaptureRes> {
        return this.withTileLock(sId, request.tile, async () => {
            const redis = RedisInstance.getCenterRedis()
            const operationId = `${sId}:${uid}:${request.clientReqId}`
            const prior = await redis.hGet(ArenaNativeLobbyStore.operationsKey, operationId)
            if (prior) {
                const stored = JSON.parse(prior) as {
                    request: IArenaCaptureReq
                    result: IArenaCaptureRes
                    error?: { code: string; msg: string }
                }
                if (stored.request.tile !== request.tile)
                    throw { code: 'OPERATION_CONFLICT', msg: '幂等请求参数不一致' }
                // 回执要连「被拒绝」的结论一起复现：削守备已经提交，重放不能再削一次，
                // 也不能把首次的拒绝改判成成功。
                if (stored.error) throw stored.error
                return stored.result
            }

            const board = await this.readBoard(sId)
            const current = board[request.tile]!
            let next: IArenaTile
            let changedOwner = false
            let blocked: { code: string; msg: string } | undefined
            if (canCaptureTile(current, uid)) {
                changedOwner = current.ownerUid !== uid
                next = {
                    tile: current.tile,
                    ownerUid: uid,
                    power: current.ownerUid === uid ? Math.min(ARENA_MAX_POWER, current.power + 1) : 1,
                }
            } else {
                // 敌格仍有守备：本次尝试**确实**削 1 点且必须提交（棋盘是权威），
                // 但客户端需要 ARENA_TILE_TAKEN 才会重读棋盘（`ArenaBoardLogic` 按该码判 boardChanged）。
                // 只削守备却回成功，会让客户端拿着过期棋盘继续操作。
                next = { ...current, power: Math.max(0, current.power - 1) }
                blocked = {
                    code: 'ARENA_TILE_TAKEN',
                    msg: `arena 格 ${current.tile} 仍由 "${current.ownerUid}" 守备（剩余 ${next.power}）`,
                }
            }
            await redis.hSet(ArenaNativeLobbyStore.tilesKey, `${sId}:${next.tile}`, JSON.stringify(next))
            const trophies = changedOwner
                ? await redis.hIncrBy(ArenaNativeLobbyStore.trophiesKey, `${sId}:${uid}`, 1)
                : await this.trophies(uid, sId)
            const result = { tile: next.tile, power: next.power, trophies }
            await redis.hSet(
                ArenaNativeLobbyStore.operationsKey,
                operationId,
                JSON.stringify(blocked ? { request, result, error: blocked } : { request, result }),
            )
            if (blocked) throw blocked
            return result
        })
    }

    /** arenaShop 只可对已拥有格加固；这不是客户端 payload 可声明的权限。 */
    async boostOwnedTile(
        uid: string,
        sId: number,
        tile: number,
        powerDelta: number,
        lockHeld = false,
    ): Promise<number> {
        if (!lockHeld) return this.withTileLock(sId, tile, () => this.boostOwnedTile(uid, sId, tile, powerDelta, true))
        const redis = RedisInstance.getCenterRedis()
        const current = (await this.readBoard(sId))[tile]!
        if (current.ownerUid !== uid) throw { code: 'ARENA_SHOP_TILE_NOT_OWNED', msg: '只能加固自己的格子' }
        const power = Math.min(ARENA_MAX_POWER, current.power + powerDelta)
        await redis.hSet(ArenaNativeLobbyStore.tilesKey, `${sId}:${tile}`, JSON.stringify({ ...current, power }))
        return power
    }

    /**
     * 跨域消费（arenaShop）可持有同一格锁覆盖“权限检查 → 扣款 → 写格”。
     * 所有更改 tile 的 arena 路径也走这里，避免另一个 uid 在扣款窗口夺走该格。
     */
    async withTileLock<T>(sId: number, tile: number, run: () => Promise<T>): Promise<T> {
        const lock = RedisLock.create(`nativeLobby:arena:tile-lock:v1:${sId}:${tile}`)
        if (!(await lock.waitLock(1_500))) throw { code: 'RATE_LIMITED', msg: '格子正在处理，请稍后重试' }
        try {
            return await run()
        } finally {
            await lock.unLock()
        }
    }

    private async trophies(uid: string, sId: number): Promise<number> {
        return Number(
            (await RedisInstance.getCenterRedis().hGet(ArenaNativeLobbyStore.trophiesKey, `${sId}:${uid}`)) ?? 0,
        )
    }

    private async readBoard(sId: number): Promise<IArenaTile[]> {
        const redis = RedisInstance.getCenterRedis()
        const raw = await redis.hGetAll(ArenaNativeLobbyStore.tilesKey)
        const rows: IArenaTile[] = []
        for (let tile = 0; tile < ARENA_TILE_COUNT; tile++) {
            const value = raw[`${sId}:${tile}`]
            if (!value) continue
            try {
                const row = JSON.parse(value) as IArenaTile
                if (row.tile === tile && typeof row.ownerUid === 'string' && Number.isSafeInteger(row.power))
                    rows.push(row)
            } catch {
                // 单格坏数据视为缺失格；不把存储异常伪装成其它玩家的所有权。
            }
        }
        return fillArenaBoard(rows)
    }
}
