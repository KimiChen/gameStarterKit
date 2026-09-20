import { randomUUID } from 'node:crypto'
import { RedisInstance } from '@arthropoda/game-engine'
import {
    applySlgTileAction,
    gridFromTileId,
    slgMapIndex,
    SLG_CHUNK_SIZE,
    type ISlgTile,
} from '../../../../generated/lobby-contract/kits/slg/api/worldmap/index'
import {
    marchDurationMs,
    SLG_MARCH_COST,
    SLG_MAX_ACTIVE_MARCHES,
    SLG_SETTLEMENT_BATCH_SIZE,
    type ISlgMarch,
} from '../../../../generated/lobby-contract/kits/slg/api/march/index'
import type {
    ISlgMapTilesReq,
    ISlgMapTilesRes,
    ISlgMarchDispatchReq,
    ISlgMarchDispatchRes,
    ISlgMarchRecallReq,
    ISlgMarchRecallRes,
    ISlgTileCaptureReq,
    ISlgTileCaptureRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/slg'
import { ShopNativeLobbyStore } from '../../shop/lobby/ShopNativeLobbyStore'

interface Operation<T> {
    readonly fingerprint: string
    readonly result: T
}

/** 到期行军索引的键前缀；成员是 marchId，分值是 `arriveAt`。 */
const DUE_KEY_PREFIX = 'nativeLobby:slg:due:v1:'

/**
 * SLG v1 的持久化面：已占领格才落库，读地图时仅枚举请求 chunk 内的实际变更。
 *
 * 到期行军由**到期索引**（按 `arriveAt` 计分的有序集合）驱动，每个请求**有界**推进一批；
 * 积压清不掉时抛 `SLG_SETTLEMENT_PENDING`（可重试类），而不是用一个 `hGetAll` 全表扫描 +
 * 无界循环把 handler 拖过 10 秒上限——超时不等于底层写入已取消，客户端重试只会再扫一遍。
 */
export class SlgNativeLobbyStore {
    private static readonly tilesKey = 'nativeLobby:slg:tiles:v1'
    private static readonly marchesKey = 'nativeLobby:slg:marches:v1'
    private static readonly operationsKey = 'nativeLobby:slg:operations:v1'
    private static readonly revisionsKey = 'nativeLobby:slg:revisions:v1'
    private static readonly trophiesKey = 'nativeLobby:slg:trophies:v1'

    // 跨模块组合放在 store 内部：模块描述符只允许引用本模块内的实现。
    constructor(private readonly wallet: ShopNativeLobbyStore = new ShopNativeLobbyStore()) {}

    async mapTiles(uid: string, sId: number, request: ISlgMapTilesReq): Promise<ISlgMapTilesRes> {
        return this.fresh(sId, async () => {
            const mapIndex = slgMapIndex(request.mapId)
            const values = await RedisInstance.getCenterRedis().hGetAll(SlgNativeLobbyStore.tilesKey)
            const tiles: ISlgTile[] = []
            for (const [field, raw] of Object.entries(values)) {
                if (!field.startsWith(`${sId}:`)) continue
                const tile = parseTile(raw)
                if (!tile || gridFromTileId(tile.tileId).mapIndex !== mapIndex || !inRect(tile.tileId, request.rect))
                    continue
                tiles.push(tile)
            }
            tiles.sort((left, right) => left.tileId - right.tileId)
            return {
                tiles,
                revision: Number(
                    (await RedisInstance.getCenterRedis().hGet(SlgNativeLobbyStore.revisionsKey, String(sId))) ?? 0,
                ),
                myTrophies: Number(
                    (await RedisInstance.getCenterRedis().hGet(SlgNativeLobbyStore.trophiesKey, `${sId}:${uid}`)) ?? 0,
                ),
            }
        })
    }

    async capture(uid: string, sId: number, request: ISlgTileCaptureReq): Promise<ISlgTileCaptureRes> {
        return this.idempotent(sId, uid, 'capture', request.clientReqId, JSON.stringify(request), () =>
            this.fresh(sId, async () => {
                const tile = await this.readTile(sId, request.tileId)
                const result = applySlgTileAction(tile, uid)
                await this.writeTile(sId, result.tile)
                if (result.outcome === 'captured')
                    await RedisInstance.getCenterRedis().hIncrBy(SlgNativeLobbyStore.trophiesKey, `${sId}:${uid}`, 1)
                return result
            }),
        )
    }

    async dispatch(uid: string, sId: number, request: ISlgMarchDispatchReq): Promise<ISlgMarchDispatchRes> {
        return this.idempotent(sId, uid, 'dispatch', request.clientReqId, JSON.stringify(request), () =>
            this.fresh(sId, async () => {
                const from = await this.readTile(sId, request.fromTile)
                if (from.ownerUid !== uid) throw { code: 'SLG_TILE_NOT_OWNED', msg: '行军起点不属于当前玩家' }
                const active = await this.activeMarches(uid, sId)
                if (active.length >= SLG_MAX_ACTIVE_MARCHES)
                    throw { code: 'SLG_MARCH_LIMIT', msg: '进行中的行军已达上限' }
                const operationId = `slg:dispatch:${sId}:${uid}:${request.clientReqId}`
                const balance = await this.wallet.debit(uid, sId, operationId, SLG_MARCH_COST)
                const departAt = Date.now()
                const march: ISlgMarch = {
                    marchId: randomUUID(),
                    uid,
                    fromTile: request.fromTile,
                    toTile: request.toTile,
                    departAt,
                    arriveAt: departAt + marchDurationMs(request.fromTile, request.toTile),
                    status: 'marching',
                }
                const redis = RedisInstance.getCenterRedis()
                const field = marchField(sId, march.marchId)
                await redis.hSet(SlgNativeLobbyStore.marchesKey, field, JSON.stringify(march))
                // 到期索引与行军记录同一事务语义：索引是派生数据，结算时以记录为准并顺手清理。
                await redis.zAdd(dueKeyOf(sId), march.arriveAt, march.marchId)
                return { march, balance: balance ?? (await this.walletBalance(uid, sId)) }
            }),
        )
    }

    async recall(uid: string, sId: number, request: ISlgMarchRecallReq): Promise<ISlgMarchRecallRes> {
        return this.idempotent(sId, uid, 'recall', request.clientReqId, JSON.stringify(request), () =>
            this.fresh(sId, async () => {
                const redis = RedisInstance.getCenterRedis()
                const raw = await redis.hGet(SlgNativeLobbyStore.marchesKey, marchField(sId, request.marchId))
                const march = raw ? parseMarch(raw) : null
                if (!march || march.uid !== uid) throw { code: 'SLG_MARCH_NOT_FOUND', msg: '行军不存在' }
                if (march.status !== 'marching') throw { code: 'SLG_MARCH_FINISHED', msg: '行军已结束' }
                const recalled = { ...march, status: 'recalled' as const }
                await redis.hSet(
                    SlgNativeLobbyStore.marchesKey,
                    marchField(sId, march.marchId),
                    JSON.stringify(recalled),
                )
                await redis.zRem(dueKeyOf(sId), march.marchId)
                return { march: recalled }
            }),
        )
    }

    private async idempotent<T>(
        sId: number,
        uid: string,
        operation: string,
        clientReqId: string,
        fingerprint: string,
        execute: () => Promise<T>,
    ): Promise<T> {
        const redis = RedisInstance.getCenterRedis()
        const field = `${sId}:${uid}:${operation}:${clientReqId}`
        const prior = await redis.hGet(SlgNativeLobbyStore.operationsKey, field)
        if (prior) {
            const stored = JSON.parse(prior) as Operation<T>
            if (stored.fingerprint !== fingerprint) throw { code: 'OPERATION_CONFLICT', msg: '幂等请求参数不一致' }
            return stored.result
        }
        const result = await execute()
        await redis.hSet(
            SlgNativeLobbyStore.operationsKey,
            field,
            JSON.stringify({ fingerprint, result } satisfies Operation<T>),
        )
        return result
    }

    /**
     * 写路径与读路径的统一入口：先把到期行军**有界**推进，再执行本次请求。
     *
     * 语义与旧服务端 `kits/slg/service.ts` 的 `fresh()` 一致：本轮还有到期事件就先结算一批；
     * 一批之后仍有积压就抛 `SLG_SETTLEMENT_PENDING`，让客户端退避重试。
     * ⛔ 不把 RPC 变成长事务，也不把「还没算完」降级成确定性结论。
     */
    private async fresh<T>(sId: number, run: () => Promise<T>): Promise<T> {
        for (let attempt = 0; attempt < 2; attempt += 1) {
            if (!(await this.hasDueMarches(sId))) return run()
            if (attempt === 1) break
            if ((await this.settleDueMarches(sId)).pending) break
        }
        throw { code: 'SLG_SETTLEMENT_PENDING', msg: '正在补算到达事件，请稍后重试' }
    }

    private async hasDueMarches(sId: number): Promise<boolean> {
        return (await readDueIndex(sId, 1)).length > 0
    }

    /**
     * 一批最多 `SLG_SETTLEMENT_BATCH_SIZE` 条；多读一条只为判断「还有没有积压」。
     * 索引是派生数据：记录已不在 marching 状态时顺手把索引项清掉，而不是当成待结算事件。
     */
    private async settleDueMarches(sId: number): Promise<{ settled: number; pending: boolean }> {
        const redis = RedisInstance.getCenterRedis()
        const due = await readDueIndex(sId, SLG_SETTLEMENT_BATCH_SIZE + 1)
        const batch = due.slice(0, SLG_SETTLEMENT_BATCH_SIZE)
        let settled = 0
        for (const marchId of batch) {
            const raw = await redis.hGet(SlgNativeLobbyStore.marchesKey, marchField(sId, marchId))
            const march = raw ? parseMarch(raw) : null
            if (!march || march.status !== 'marching') {
                await redis.zRem(dueKeyOf(sId), marchId)
                continue
            }
            const tile = await this.readTile(sId, march.toTile)
            const applied = applySlgTileAction(tile, march.uid)
            await this.writeTile(sId, applied.tile)
            if (applied.outcome === 'captured')
                await redis.hIncrBy(SlgNativeLobbyStore.trophiesKey, `${sId}:${march.uid}`, 1)
            await redis.hSet(
                SlgNativeLobbyStore.marchesKey,
                marchField(sId, march.marchId),
                JSON.stringify({ ...march, status: 'arrived' }),
            )
            await redis.zRem(dueKeyOf(sId), marchId)
            settled += 1
        }
        return { settled, pending: due.length > batch.length }
    }

    private async activeMarches(uid: string, sId: number): Promise<ISlgMarch[]> {
        const rows = await RedisInstance.getCenterRedis().hGetAll(SlgNativeLobbyStore.marchesKey)
        return Object.entries(rows)
            .filter(([field]) => field.startsWith(`${sId}:`))
            .map(([, raw]) => parseMarch(raw))
            .filter((value): value is ISlgMarch => value?.uid === uid && value.status === 'marching')
    }

    private async readTile(sId: number, tileId: number): Promise<ISlgTile> {
        const raw = await RedisInstance.getCenterRedis().hGet(SlgNativeLobbyStore.tilesKey, tileField(sId, tileId))
        return raw && parseTile(raw) ? parseTile(raw)! : { tileId, ownerUid: '', guardPower: 0 }
    }

    private async writeTile(sId: number, tile: ISlgTile): Promise<void> {
        const redis = RedisInstance.getCenterRedis()
        await redis.hSet(SlgNativeLobbyStore.tilesKey, tileField(sId, tile.tileId), JSON.stringify(tile))
        await redis.hIncrBy(SlgNativeLobbyStore.revisionsKey, String(sId), 1)
    }

    private async walletBalance(uid: string, sId: number): Promise<number> {
        return Number((await RedisInstance.getCenterRedis().hGet('nativeLobby:shop:balance:v1', `${sId}:${uid}`)) ?? 0)
    }
}

function tileField(sId: number, tileId: number): string {
    return `${sId}:${tileId}`
}
function marchField(sId: number, marchId: string): string {
    return `${sId}:${marchId}`
}
/** 到期索引按区服分桶：成员只有 marchId，读取时不必再按前缀过滤别的区。 */
function dueKeyOf(sId: number): string {
    return `${DUE_KEY_PREFIX}${sId}`
}

/**
 * 有界读到期索引所需的**原始客户端**能力。
 *
 * 引擎的 `RedisCache.zRangeByScore(key, min, max, isRev)` 只有分值区间、**没有条数上限**：
 * 用它就只能把整个到期集合读进内存再切片，「有界结算」于是只剩一半——积压时第一个 10 秒上限
 * 就落在读上，而读超时不代表写入已取消。故与通用幂等闸同样取原始客户端，
 * 把 `LIMIT` 下推到存储层，并把所需形状显式声明出来（测试假体据此镜像）。
 */
interface DueIndexRedis {
    zRangeByScore(
        key: string,
        min: string | number,
        max: string | number,
        options: { LIMIT: { offset: number; count: number } },
    ): Promise<Array<string | Buffer>>
}

/** 到期索引的有界读取：最多 `count` 条，按 `arriveAt` 升序。 */
async function readDueIndex(sId: number, count: number): Promise<string[]> {
    const client = RedisInstance.getCenterRedis().client() as unknown as DueIndexRedis
    const members = await client.zRangeByScore(dueKeyOf(sId), '-inf', Date.now(), {
        LIMIT: { offset: 0, count },
    })
    return members.map((member) => String(member))
}
function inRect(tileId: number, rect: ISlgMapTilesReq['rect']): boolean {
    const point = gridFromTileId(tileId)
    const x = Math.floor(point.x / SLG_CHUNK_SIZE),
        y = Math.floor(point.y / SLG_CHUNK_SIZE)
    return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY
}
function parseTile(value: string): ISlgTile | null {
    try {
        const tile = JSON.parse(value) as ISlgTile
        return Number.isSafeInteger(tile.tileId) &&
            typeof tile.ownerUid === 'string' &&
            Number.isSafeInteger(tile.guardPower)
            ? tile
            : null
    } catch {
        return null
    }
}
function parseMarch(value: string): ISlgMarch | null {
    try {
        const march = JSON.parse(value) as ISlgMarch
        return typeof march.marchId === 'string' && typeof march.uid === 'string' && typeof march.status === 'string'
            ? march
            : null
    } catch {
        return null
    }
}
