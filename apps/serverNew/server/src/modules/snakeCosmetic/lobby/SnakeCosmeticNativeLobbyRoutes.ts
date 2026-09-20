import { executeObjectAction, type LobbyConnectionContext } from '@arthropoda/game-engine'
import {
    SnakeCosmeticRpc,
    type ISnakeCosmeticProfileRes,
    type ISnakeCosmeticSkinReq,
    type ISnakeCosmeticSnapshotRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/snakeCosmetic'
import type { NativeLobbyIdentityResolver } from '../../../runtime/identity/NativeLobbyAuthProvider'
import type { NativeLobbyRouteRegistry } from '../../../runtime/lobby/NativeLobbyRouteRegistry'
import { SnakeCosmeticNativeLobbyStore } from './SnakeCosmeticNativeLobbyStore'

/** snakeCosmetic 的对象 Action 适配层；衣柜读写与目录下发都在所属模块内完成。 */
export class SnakeCosmeticNativeLobbyRoutes {
    constructor(
        private readonly identities: NativeLobbyIdentityResolver,
        private readonly store: SnakeCosmeticNativeLobbyStore,
    ) {}

    register(registry: NativeLobbyRouteRegistry): void {
        registry.register(SnakeCosmeticRpc.GetSnapshot, (context) =>
            this.run(
                context,
                SnakeCosmeticRpc.GetSnapshot,
                {},
                { profile: undefined, catalog: undefined } as unknown as ISnakeCosmeticSnapshotRes,
                async (_req, res) => {
                    Object.assign(res, await this.store.snapshot(context.uid, context.sId))
                },
            ),
        )
        registry.register(SnakeCosmeticRpc.Equip, (context, payload) =>
            this.run<ISnakeCosmeticSkinReq, ISnakeCosmeticProfileRes>(
                context,
                SnakeCosmeticRpc.Equip,
                payload as ISnakeCosmeticSkinReq,
                {} as ISnakeCosmeticProfileRes,
                async (req, res) => {
                    Object.assign(res, await this.store.equip(context.uid, context.sId, req.skinId))
                },
            ),
        )
        registry.register(SnakeCosmeticRpc.Unlock, (context, payload) =>
            this.run<ISnakeCosmeticSkinReq, ISnakeCosmeticProfileRes>(
                context,
                SnakeCosmeticRpc.Unlock,
                payload as ISnakeCosmeticSkinReq,
                {} as ISnakeCosmeticProfileRes,
                async (req, res) => {
                    Object.assign(res, await this.store.unlock(context.uid, context.sId, req.skinId))
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
