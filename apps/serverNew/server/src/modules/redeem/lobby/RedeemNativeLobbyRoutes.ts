import { executeObjectAction, lobbyRouteOutcome } from '@arthropoda/game-engine'
import {
    RedeemRpc,
    type IRedeemClaimReq,
    type IRedeemClaimRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/redeem'
import type { NativeLobbyIdentityResolver } from '../../../runtime/identity/NativeLobbyAuthProvider'
import type { NativeLobbyRouteRegistry } from '../../../runtime/lobby/NativeLobbyRouteRegistry'
import { RedeemNativeLobbyStore } from './RedeemNativeLobbyStore'
export class RedeemNativeLobbyRoutes {
    constructor(
        private readonly identities: NativeLobbyIdentityResolver,
        private readonly store: RedeemNativeLobbyStore,
    ) {}
    register(registry: NativeLobbyRouteRegistry): void {
        registry.register(RedeemRpc.Claim, async (c, p) => {
            const uid = await this.identities.resolve(c.uid, c.sId),
                res = { code: '', reward: { kind: 'coins' as const, amount: 1 }, balance: 0 } as IRedeemClaimRes
            const result = await executeObjectAction(
                RedeemRpc.Claim,
                p as IRedeemClaimReq,
                res,
                {
                    doAction: async (req, out) => {
                        Object.assign(out, await this.store.claim(c.uid, c.sId, req))
                    },
                },
                { uid, externalUid: c.uid, sId: c.sId },
            )
            if (result.ok) return lobbyRouteOutcome(result.data, result.sync) as unknown as IRedeemClaimRes
            throw result.error
        })
    }
}
