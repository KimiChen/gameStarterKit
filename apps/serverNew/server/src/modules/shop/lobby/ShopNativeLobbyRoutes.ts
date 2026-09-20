import { executeObjectAction, type LobbyConnectionContext } from '@arthropoda/game-engine'
import {
    ShopRpc,
    type IPurchaseResult,
    type IShopPurchaseReq,
    type IShopQueryOpReq,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import type { NativeLobbyIdentityResolver } from '../../../runtime/identity/NativeLobbyAuthProvider'
import type { NativeLobbyRouteRegistry } from '../../../runtime/lobby/NativeLobbyRouteRegistry'
import { ShopNativeLobbyStore } from './ShopNativeLobbyStore'
export class ShopNativeLobbyRoutes {
    constructor(
        private readonly identities: NativeLobbyIdentityResolver,
        private readonly store: ShopNativeLobbyStore,
    ) {}
    register(registry: NativeLobbyRouteRegistry): void {
        registry.register(ShopRpc.Purchase, (c, p) =>
            this.run(c, ShopRpc.Purchase, p as IShopPurchaseReq, async (r) => this.store.purchase(c.uid, c.sId, r)),
        )
        registry.register(ShopRpc.QueryOp, (c, p) =>
            this.run(c, ShopRpc.QueryOp, p as IShopQueryOpReq, async (r) => this.store.query(c.uid, c.sId, r.opId)),
        )
    }
    private async run<Req>(
        c: LobbyConnectionContext,
        route: string,
        req: Req,
        action: (req: Req) => Promise<IPurchaseResult>,
    ): Promise<IPurchaseResult> {
        const uid = await this.identities.resolve(c.uid, c.sId)
        const res: IPurchaseResult = { opId: 'pending', status: 'dead', balance: 0 }
        const result = await executeObjectAction(
            route,
            req,
            res,
            {
                doAction: async (request, response) => {
                    Object.assign(response, await action(request))
                },
            },
            { uid, externalUid: c.uid, sId: c.sId },
        )
        if (result.ok) return result.data
        throw result.error
    }
}
