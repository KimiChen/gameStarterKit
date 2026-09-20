import { executeObjectAction, type LobbyConnectionContext } from '@arthropoda/game-engine'
import {
    GuildRpc,
    type IGuildGetEventsReq,
    type IGuildGetEventsRes,
    type IGuildJoinReq,
    type IGuildJoinRes,
    type IGuildLeaveRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import type { NativeLobbyIdentityResolver } from '../../../runtime/identity/NativeLobbyAuthProvider'
import type { NativeLobbyRouteRegistry } from '../../../runtime/lobby/NativeLobbyRouteRegistry'
import { GuildNativeLobbyStore } from './GuildNativeLobbyStore'

export class GuildNativeLobbyRoutes {
    constructor(
        private readonly identities: NativeLobbyIdentityResolver,
        private readonly store: GuildNativeLobbyStore,
    ) {}

    register(registry: NativeLobbyRouteRegistry): void {
        registry.register(GuildRpc.Join, (context, payload) =>
            this.run(
                context,
                GuildRpc.Join,
                payload as IGuildJoinReq,
                { ok: false, seq: 0 } as IGuildJoinRes,
                async (_p, res) => {
                    Object.assign(res, await this.store.join(context, _p))
                },
                // 同一工会的成员上限与事件 seq 是共享资源：按 guildId 串行，跨进程也走同一个分组。
                (payload as IGuildJoinReq).guildId,
            ),
        )
        registry.register(GuildRpc.Leave, (context) =>
            this.run(context, GuildRpc.Leave, {}, { ok: false } as IGuildLeaveRes, async (_p, res) => {
                Object.assign(res, await this.store.leave(context))
            }),
        )
        registry.register(GuildRpc.GetEvents, (context, payload) =>
            this.run(
                context,
                GuildRpc.GetEvents,
                payload as IGuildGetEventsReq,
                { events: [], latestSeq: 0, guildId: 0 } as IGuildGetEventsRes,
                async (p, res) => {
                    Object.assign(res, await this.store.events(context, p))
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
        bindId?: number,
    ): Promise<Res> {
        const uid = await this.identities.resolve(context.uid, context.sId)
        const result = await executeObjectAction(
            route,
            req,
            res,
            { doAction: action, getBindId: async () => bindId },
            { uid, externalUid: context.uid, sId: context.sId },
        )
        if (result.ok) return result.data
        throw result.error
    }
}
