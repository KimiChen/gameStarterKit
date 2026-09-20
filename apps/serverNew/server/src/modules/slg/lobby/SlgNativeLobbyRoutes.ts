import { executeObjectAction, type LobbyConnectionContext } from '@arthropoda/game-engine'
import {
    SlgRpc,
    type ISlgMapTilesReq,
    type ISlgMapTilesRes,
    type ISlgMarchDispatchReq,
    type ISlgMarchDispatchRes,
    type ISlgMarchRecallReq,
    type ISlgMarchRecallRes,
    type ISlgTileCaptureReq,
    type ISlgTileCaptureRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/slg'
import type { NativeLobbyIdentityResolver } from '../../../runtime/identity/NativeLobbyAuthProvider'
import type { NativeLobbyRouteRegistry } from '../../../runtime/lobby/NativeLobbyRouteRegistry'
import { SlgNativeLobbyStore } from './SlgNativeLobbyStore'

/** SLG 的四条 Lobby 路由均经 ObjectAction，保证和其它写路径共享 ServerTask 生命周期。 */
export class SlgNativeLobbyRoutes {
    constructor(
        private readonly identities: NativeLobbyIdentityResolver,
        private readonly store: SlgNativeLobbyStore,
    ) {}

    register(registry: NativeLobbyRouteRegistry): void {
        registry.register(SlgRpc.MapTiles, (c, p) =>
            this.run(
                c,
                SlgRpc.MapTiles,
                p as ISlgMapTilesReq,
                { tiles: [], revision: 0, myTrophies: 0 } as ISlgMapTilesRes,
                async (req, res) => {
                    Object.assign(res, await this.store.mapTiles(c.uid, c.sId, req))
                },
            ),
        )
        registry.register(SlgRpc.TileCapture, (c, p) =>
            this.run(
                c,
                SlgRpc.TileCapture,
                p as ISlgTileCaptureReq,
                { tile: { tileId: 0, ownerUid: '', guardPower: 0 }, outcome: 'captured' } as ISlgTileCaptureRes,
                async (req, res) => {
                    Object.assign(res, await this.store.capture(c.uid, c.sId, req))
                },
            ),
        )
        registry.register(SlgRpc.MarchDispatch, (c, p) =>
            this.run(
                c,
                SlgRpc.MarchDispatch,
                p as ISlgMarchDispatchReq,
                { march: emptyMarch(), balance: 0 } as ISlgMarchDispatchRes,
                async (req, res) => {
                    Object.assign(res, await this.store.dispatch(c.uid, c.sId, req))
                },
            ),
        )
        registry.register(SlgRpc.MarchRecall, (c, p) =>
            this.run(
                c,
                SlgRpc.MarchRecall,
                p as ISlgMarchRecallReq,
                { march: emptyMarch() } as ISlgMarchRecallRes,
                async (req, res) => {
                    Object.assign(res, await this.store.recall(c.uid, c.sId, req))
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

function emptyMarch() {
    return {
        marchId: 'pending',
        uid: 'pending',
        fromTile: 0,
        toTile: 1,
        departAt: 0,
        arriveAt: 1000,
        status: 'marching' as const,
    }
}
