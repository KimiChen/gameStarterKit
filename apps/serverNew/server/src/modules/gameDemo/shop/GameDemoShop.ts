import { GameDemoHash as AtomicHash, GameDemoOperation as AtomicOperation } from '../GameDemoPersistence'
import { AtomicHashTransaction, atomicCounterCodec } from '@arthropoda/game-engine'
import { GAME_DEMO_CONFIG, gameDemoBusinessDate } from '../../../../generated/lobby-contract/kits/gameDemo/config'
import {
    validateGameDemoAssetsRes,
    type IGameDemoAssetsRes,
    type IGameDemoShopRes,
    type IGameDemoBuyReq,
} from '../../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemo'
import { NativeLobbyAssets } from '../../../runtime/lobby/NativeLobbyAssets'
import { GameDemoAccount } from '../growth/GameDemoAccount'

export class GameDemoShop {
    private readonly purchases = new AtomicHash('kt:gameDemo:shop-daily:v1', atomicCounterCodec)
    private readonly operations = new AtomicOperation(
        'kt:gameDemo:shop-operations:v1',
        (value): value is IGameDemoAssetsRes => {
            try {
                validateGameDemoAssetsRes(value)
                return true
            } catch {
                return false
            }
        },
    )

    async read(uid: string, sId: number, now = Date.now()): Promise<IGameDemoShopRes> {
        const day = gameDemoBusinessDate(now)
        return AtomicHashTransaction.run(async (tx) => ({
            assets: await new GameDemoAccount().snapshot(tx, uid, sId),
            day,
            purchased: {
                herb: (await tx.get(this.purchases, JSON.stringify([sId, uid, day, 'herb']))) ?? 0,
                dew: (await tx.get(this.purchases, JSON.stringify([sId, uid, day, 'dew']))) ?? 0,
            },
        }))
    }

    async buy(uid: string, sId: number, request: IGameDemoBuyReq, now = Date.now()): Promise<IGameDemoAssetsRes> {
        const product = GAME_DEMO_CONFIG.shop.find((value) => value.id === request.product)
        if (!product || !Number.isSafeInteger(request.count) || request.count < 1 || request.count > 100)
            throw { code: 'INVALID_PAYLOAD', msg: '商品或数量无效' }
        const day = gameDemoBusinessDate(now)
        const field = JSON.stringify([sId, uid, day, product.id])
        const result = await this.operations.run(
            JSON.stringify([sId, uid, request.clientReqId]),
            JSON.stringify([product.id, request.count]),
            async (tx) => {
                const account = new GameDemoAccount()
                if (!(await account.snapshot(tx, uid, sId)).initialized)
                    throw { code: 'GAME_DEMO_NOT_INITIALIZED', msg: '请先初始化玩法账号' }
                const purchased = (await tx.get(this.purchases, field)) ?? 0
                if (purchased + request.count > product.dailyLimit)
                    throw { code: 'GAME_DEMO_LIMIT', msg: '超过今日限购数量' }
                await NativeLobbyAssets.changeGold(tx, uid, sId, -product.price * request.count)
                await NativeLobbyAssets.changeItem(tx, uid, sId, product.itemId, request.count)
                await tx.set(this.purchases, field, purchased + request.count)
                return account.snapshot(tx, uid, sId)
            },
        )
        return validateGameDemoAssetsRes(result)
    }
}
