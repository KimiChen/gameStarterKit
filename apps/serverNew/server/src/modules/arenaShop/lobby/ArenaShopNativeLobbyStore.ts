import { ARENA_BOOST_POWER } from '../../../../generated/lobby-contract/kits/arena/api/board/index'
import { RedisInstance } from '@arthropoda/game-engine'
import { ARENA_SHOP_BOOST_COST } from '../../../../generated/lobby-contract/protocol/lobbyRpc/checks/arenaShop'
import {
    type IArenaShopBuyBoostReq,
    type IArenaShopBuyBoostRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/arenaShop'
import { ArenaNativeLobbyStore } from '../../arena/lobby/ArenaNativeLobbyStore'
import { ShopNativeLobbyStore } from '../../shop/lobby/ShopNativeLobbyStore'

/** arenaShop 用既有金币账本扣款，先验证格归属再扣款，避免失败操作产生消费。 */
export class ArenaShopNativeLobbyStore {
    private static readonly operationsKey = 'nativeLobby:arenaShop:operations:v1'

    // 跨模块组合放在 store 内部：模块描述符只允许引用本模块内的实现，组合细节不进入描述符。
    constructor(
        private readonly arena: ArenaNativeLobbyStore = new ArenaNativeLobbyStore(),
        private readonly wallet: ShopNativeLobbyStore = new ShopNativeLobbyStore(),
    ) {}

    async buyBoost(uid: string, sId: number, request: IArenaShopBuyBoostReq): Promise<IArenaShopBuyBoostRes> {
        const operationId = `arenaShop:${sId}:${uid}:${request.clientReqId}`
        return this.arena.withTileLock(sId, request.tile, async () => {
            const redis = RedisInstance.getCenterRedis()
            const prior = await redis.hGet(ArenaShopNativeLobbyStore.operationsKey, operationId)
            if (prior) {
                const stored = JSON.parse(prior) as { tile: number; result: IArenaShopBuyBoostRes }
                if (stored.tile !== request.tile) throw { code: 'OPERATION_CONFLICT', msg: '幂等请求参数不一致' }
                return stored.result
            }
            // 锁覆盖归属检查、扣款和加固；capture 走同一锁，不能在扣款后改走这格。
            await this.arena.boostOwnedTile(uid, sId, request.tile, 0, true)
            const balance = await this.wallet.debit(uid, sId, operationId, ARENA_SHOP_BOOST_COST)
            const power =
                balance === null
                    ? await this.arena.boostOwnedTile(uid, sId, request.tile, 0, true)
                    : await this.arena.boostOwnedTile(uid, sId, request.tile, ARENA_BOOST_POWER, true)
            const result = { tile: request.tile, power, balance }
            await redis.hSet(
                ArenaShopNativeLobbyStore.operationsKey,
                operationId,
                JSON.stringify({ tile: request.tile, result }),
            )
            return result
        })
    }
}
