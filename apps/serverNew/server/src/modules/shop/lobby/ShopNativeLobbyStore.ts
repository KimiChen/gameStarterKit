import { RedisInstance } from '@arthropoda/game-engine'
import type { IPurchaseResult, IShopPurchaseReq } from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import { applyGrants, assertLandableGrants, grantBusinessError } from '../../../runtime/lobby/NativeLobbyGrants'

const CATALOG: Record<string, { price: number; granted: { kind: 'item'; itemId: number; count: number }[] }> = {
    'shop.frag29x10': { price: 100, granted: [{ kind: 'item', itemId: 29, count: 10 }] },
    'shop.frag17x10': { price: 100, granted: [{ kind: 'item', itemId: 17, count: 10 }] },
}

export class ShopNativeLobbyStore {
    private static readonly balanceKey = 'nativeLobby:shop:balance:v1'
    private static readonly operationsKey = 'nativeLobby:shop:operations:v1'
    async credit(uid: string, sId: number, amount: number): Promise<number> {
        if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('invalid credit')
        return RedisInstance.getCenterRedis().hIncrBy(ShopNativeLobbyStore.balanceKey, `${sId}:${uid}`, amount)
    }

    /**
     * 供其它 Lobby 域消费同一金币账本。operationId 是调用域自己的稳定幂等键：
     * 先检查回执，再扣款并写回执，调用方不得把 RPC 配对 id 当作此值。
     */
    async debit(uid: string, sId: number, operationId: string, amount: number): Promise<number | null> {
        if (!operationId || !Number.isSafeInteger(amount) || amount < 1) throw new Error('invalid wallet debit')
        const redis = RedisInstance.getCenterRedis()
        const receiptKey = 'nativeLobby:shop:wallet-receipts:v1'
        const prior = await redis.hGet(receiptKey, operationId)
        if (prior) {
            const receipt = JSON.parse(prior) as { uid: string; sId: number; amount: number }
            if (receipt.uid !== uid || receipt.sId !== sId || receipt.amount !== amount) {
                throw { code: 'OPERATION_CONFLICT', msg: '幂等请求参数不一致' }
            }
            return null
        }
        const field = `${sId}:${uid}`
        const balance = Number((await redis.hGet(ShopNativeLobbyStore.balanceKey, field)) ?? 0)
        if (balance < amount) throw { code: 'INSUFFICIENT_BALANCE', msg: '余额不足' }
        const next = balance - amount
        await redis.hSet(ShopNativeLobbyStore.balanceKey, field, String(next))
        await redis.hSet(receiptKey, operationId, JSON.stringify({ uid, sId, amount, balance: next }))
        return next
    }
    async purchase(uid: string, sId: number, req: IShopPurchaseReq): Promise<IPurchaseResult> {
        const opId = `shop:${sId}:${uid}:${req.clientReqId}`
        const prior = await this.readOperation(opId)
        // 幂等：同一 clientReqId 换商品是稳定冲突；重放返回首次结果（含中断在 granting 的那次）。
        if (prior && prior.sku !== req.sku) throw { code: 'ORDER_MISMATCH', msg: '幂等请求参数不一致' }
        const item = CATALOG[req.sku]
        if (!item) throw { code: 'INVALID_PAYLOAD', msg: '未知商品' }
        // 发放可行性必须在**扣款之前**判定：先扣钱再把发不出去的 grant 丢掉，比直接报错严重得多。
        assertLandableGrants(item.granted)
        // 账本回执保证重试不重复扣款；已扣过则回读当前余额，不把余额重新算一遍。
        const balance = prior ? prior.result.balance : await this.charge(uid, sId, opId, item.price)
        if (!prior) {
            // 阶段 1：先落 intent（granting），再发放。崩溃窗口里客户端拿到的是 granting，
            // 而不是「done 但没有道具」——后者会让客户端把丢失的奖励当成已到手。
            await this.writeOperation(opId, {
                sku: req.sku,
                result: { opId, status: 'granting', balance, granted: item.granted },
            })
        }
        try {
            await applyGrants(uid, sId, opId, item.granted)
        } catch (error) {
            // 发放失败：不吞错、不改判 done。回执留在 granting，客户端按契约轮询 shop.queryOp，
            // 用同一 clientReqId 重试本路由即可续做（发放回执保证不会重复发）。
            throw grantBusinessError(error)
        }
        const result: IPurchaseResult = { opId, status: 'done', balance, granted: item.granted }
        await this.writeOperation(opId, { sku: req.sku, result })
        return result
    }

    async query(uid: string, sId: number, opId: string): Promise<IPurchaseResult> {
        // 查询是只读路由（query 模式）：⛔ 不在这里续做发放，恢复只走写路径重试。
        const value = await RedisInstance.getCenterRedis().hGet(ShopNativeLobbyStore.operationsKey, opId)
        if (!value || !opId.startsWith(`shop:${sId}:${uid}:`))
            throw { code: 'OPERATION_RESULT_EXPIRED', msg: '订单结果不可用' }
        return (JSON.parse(value) as { result: IPurchaseResult }).result
    }

    private async charge(uid: string, sId: number, opId: string, price: number): Promise<number> {
        const charged = await this.debit(uid, sId, opId, price)
        return charged ?? (await this.balanceOf(uid, sId))
    }

    private async balanceOf(uid: string, sId: number): Promise<number> {
        return Number(
            (await RedisInstance.getCenterRedis().hGet(ShopNativeLobbyStore.balanceKey, `${sId}:${uid}`)) ?? 0,
        )
    }

    private async readOperation(opId: string): Promise<{ sku: string; result: IPurchaseResult } | null> {
        const value = await RedisInstance.getCenterRedis().hGet(ShopNativeLobbyStore.operationsKey, opId)
        if (!value) return null
        try {
            const stored = JSON.parse(value) as { sku: string; result: IPurchaseResult }
            return typeof stored?.sku === 'string' && stored.result ? stored : null
        } catch {
            throw { code: 'INTERNAL', msg: '订单回执不可用' }
        }
    }

    private writeOperation(opId: string, value: { sku: string; result: IPurchaseResult }): Promise<unknown> {
        return RedisInstance.getCenterRedis().hSet(ShopNativeLobbyStore.operationsKey, opId, JSON.stringify(value))
    }
}
