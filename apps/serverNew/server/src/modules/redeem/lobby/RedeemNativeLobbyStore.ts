import { RedisInstance } from '@arthropoda/game-engine'
import type {
    IRedeemClaimReq,
    IRedeemClaimRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/redeem'
import { ShopNativeLobbyStore } from '../../shop/lobby/ShopNativeLobbyStore'
const CODES: Record<string, number> = { WELCOME100: 100 }
/** 兑换码领取状态按用户和区服持久化；同码第二次（即使换 clientReqId）固定拒绝。 */
export class RedeemNativeLobbyStore {
    // 跨模块组合放在 store 内部：模块描述符只允许引用本模块内的实现。
    constructor(private readonly wallet: ShopNativeLobbyStore = new ShopNativeLobbyStore()) {}
    async claim(uid: string, sId: number, req: IRedeemClaimReq): Promise<IRedeemClaimRes> {
        const amount = CODES[req.code]
        if (!amount) throw { code: 'REDEEM_CODE_INVALID', msg: '兑换码无效' }
        const redis = RedisInstance.getCenterRedis(),
            requestKey = `${sId}:${uid}:${req.clientReqId}`,
            claimsKey = 'nativeLobby:redeem:claims:v1',
            requestsKey = 'nativeLobby:redeem:requests:v1'
        const previous = await redis.hGet(requestsKey, requestKey)
        if (previous) {
            const value = JSON.parse(previous) as { code: string; result: IRedeemClaimRes }
            if (value.code !== req.code) throw { code: 'OPERATION_CONFLICT', msg: '幂等请求参数不一致' }
            return value.result
        }
        if (!(await redis.hSetNX(claimsKey, `${sId}:${uid}:${req.code}`, req.clientReqId)))
            throw { code: 'REDEEM_CODE_USED', msg: '兑换码已领取' }
        const balance = await this.wallet.credit(uid, sId, amount)
        const result: IRedeemClaimRes = { code: req.code, reward: { kind: 'coins', amount }, balance }
        await redis.hSet(requestsKey, requestKey, JSON.stringify({ code: req.code, result }))
        return result
    }
}
