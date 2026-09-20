import { executeObjectAction, type LobbyConnectionContext } from '@arthropoda/game-engine'
import {
    RoomRpc,
    type IRoomPrepareCreateReq,
    type IRoomResolveReq,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import type { NativeLobbyIdentityResolver } from '../../../runtime/identity/NativeLobbyAuthProvider'
import type { NativeLobbyRouteRegistry } from '../../../runtime/lobby/NativeLobbyRouteRegistry'
import { assertInviteProfilesDeclared } from './RoomGameplayCatalog'
import { RoomNativeLobbyStore } from './RoomNativeLobbyStore'
export class RoomNativeLobbyRoutes {
    constructor(
        private readonly identities: NativeLobbyIdentityResolver,
        private readonly store: RoomNativeLobbyStore,
    ) {}
    register(registry: NativeLobbyRouteRegistry): void {
        // 装配期 fail-closed：登记的 invite-code profile 不得悬空，且声明它的 mode 必须带
        // `inviteRoom` fragment。目录与策略漂移要挡在启动阶段，而不是等到有人建房才发现。
        assertInviteProfilesDeclared()
        registry.register(RoomRpc.PrepareCreate, (c, p) =>
            this.run(c, RoomRpc.PrepareCreate, p as IRoomPrepareCreateReq, async (r) =>
                this.store.prepare(c.uid, c.sId, r),
            ),
        )
        registry.register(RoomRpc.Resolve, (c, p) =>
            this.run(c, RoomRpc.Resolve, p as IRoomResolveReq, async (r) => this.store.resolve(c.uid, c.sId, r.code)),
        )
    }
    private async run<Req, Res>(
        c: LobbyConnectionContext,
        route: string,
        req: Req,
        action: (req: Req) => Promise<Res>,
    ): Promise<Res> {
        const uid = await this.identities.resolve(c.uid, c.sId)
        const res = {} as Res
        const result = await executeObjectAction(
            route,
            req,
            res,
            {
                doAction: async (r, out) => {
                    Object.assign(out as object, await action(r))
                },
            },
            { uid, externalUid: c.uid, sId: c.sId },
        )
        if (result.ok) return result.data
        throw result.error
    }
}
