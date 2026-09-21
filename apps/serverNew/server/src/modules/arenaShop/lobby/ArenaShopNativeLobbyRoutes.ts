import { executeObjectAction, lobbyRouteOutcome, type LobbyConnectionContext } from '@arthropoda/game-engine'
import {
    ArenaShopRpc,
    type IArenaShopBuyBoostReq,
    type IArenaShopBuyBoostRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/arenaShop'
import type { NativeLobbyIdentityResolver } from '../../../runtime/identity/NativeLobbyAuthProvider'
import type { NativeLobbyRouteRegistry } from '../../../runtime/lobby/NativeLobbyRouteRegistry'
import { ArenaShopNativeLobbyStore } from './ArenaShopNativeLobbyStore'

export class ArenaShopNativeLobbyRoutes {
    constructor(
        private readonly identities: NativeLobbyIdentityResolver,
        private readonly store: ArenaShopNativeLobbyStore,
    ) {}

    register(registry: NativeLobbyRouteRegistry): void {
        registry.register(ArenaShopRpc.BuyBoost, (context, payload) =>
            this.run(
                context,
                payload as IArenaShopBuyBoostReq,
                { tile: 0, power: 0, balance: null } as IArenaShopBuyBoostRes,
            ),
        )
    }

    private async run(
        context: LobbyConnectionContext,
        request: IArenaShopBuyBoostReq,
        response: IArenaShopBuyBoostRes,
    ): Promise<IArenaShopBuyBoostRes> {
        const uid = await this.identities.resolve(context.uid, context.sId)
        const result = await executeObjectAction(
            ArenaShopRpc.BuyBoost,
            request,
            response,
            {
                doAction: async (req, res) => {
                    Object.assign(res, await this.store.buyBoost(context.uid, context.sId, req))
                },
            },
            { uid, externalUid: context.uid, sId: context.sId },
        )
        if (result.ok) return lobbyRouteOutcome(result.data, result.sync) as unknown as IArenaShopBuyBoostRes
        throw result.error
    }
}
