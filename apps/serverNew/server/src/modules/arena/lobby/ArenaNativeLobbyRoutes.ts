import { executeObjectAction, type LobbyConnectionContext } from '@arthropoda/game-engine'
import {
    ArenaRpc,
    type IArenaBoardReq,
    type IArenaCaptureReq,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/arena'
import type { NativeLobbyIdentityResolver } from '../../../runtime/identity/NativeLobbyAuthProvider'
import type { NativeLobbyRouteRegistry } from '../../../runtime/lobby/NativeLobbyRouteRegistry'
import { ArenaNativeLobbyStore } from './ArenaNativeLobbyStore'

/** arena 的对象 Action 适配层；棋盘和幂等收据由本域 store 持久化。 */
export class ArenaNativeLobbyRoutes {
    constructor(
        private readonly identities: NativeLobbyIdentityResolver,
        private readonly store: ArenaNativeLobbyStore,
    ) {}

    register(registry: NativeLobbyRouteRegistry): void {
        registry.register(ArenaRpc.Board, (context, payload) =>
            this.run(
                context,
                ArenaRpc.Board,
                payload as IArenaBoardReq,
                { tiles: [], myTrophies: 0 },
                async (_req, res) => {
                    Object.assign(res, await this.store.board(context.uid, context.sId))
                },
            ),
        )
        registry.register(ArenaRpc.Capture, (context, payload) =>
            this.run(
                context,
                ArenaRpc.Capture,
                payload as IArenaCaptureReq,
                { tile: 0, power: 0, trophies: 0 },
                async (req, res) => {
                    Object.assign(res, await this.store.capture(context.uid, context.sId, req))
                },
            ),
        )
    }

    private async run<Req, Res>(
        context: LobbyConnectionContext,
        route: string,
        req: Req,
        res: Res,
        action: (req: Req, res: Res) => Promise<void>,
    ): Promise<Res> {
        const uid = await this.identities.resolve(context.uid, context.sId)
        const result = await executeObjectAction(
            route,
            req,
            res,
            { doAction: action },
            { uid, externalUid: context.uid, sId: context.sId },
        )
        if (result.ok) return result.data
        throw result.error
    }
}
