import { executeObjectAction, lobbyRouteOutcome, type LobbyConnectionContext } from '@arthropoda/game-engine'
import {
    IncomeRpc,
    type IIncomeClaimOfflineReq,
    type IIncomeClaimOfflineRes,
    type IIncomeGetPendingRes,
    type IIncomeSettleOnlineRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/income'
import type { NativeLobbyIdentityResolver } from '../../../runtime/identity/NativeLobbyAuthProvider'
import type { NativeLobbyRouteRegistry } from '../../../runtime/lobby/NativeLobbyRouteRegistry'
import type { IncomeNativeLobbyStore } from './IncomeNativeLobbyStore'

/** income 域的原生 Lobby handler；所有入口先经过 ObjectAction，保留 ServerTask 生命周期。 */
export class IncomeNativeLobbyRoutes {
    constructor(
        private readonly identities: NativeLobbyIdentityResolver,
        private readonly store: IncomeNativeLobbyStore,
    ) {}

    register(registry: NativeLobbyRouteRegistry): void {
        registry.register(IncomeRpc.GetPending, (context) => this.getPending(context))
        registry.register(IncomeRpc.SettleOnline, (context) => this.settleOnline(context))
        registry.register(IncomeRpc.ClaimOffline, (context, payload) =>
            this.claimOffline(context, payload as IIncomeClaimOfflineReq),
        )
    }

    private getPending(context: LobbyConnectionContext): Promise<IIncomeGetPendingRes> {
        return this.run(context, IncomeRpc.GetPending, {} as IIncomeGetPendingRes, async (out, uid, sId) => {
            Object.assign(out, await this.store.pending(uid, sId))
        })
    }

    private settleOnline(context: LobbyConnectionContext): Promise<IIncomeSettleOnlineRes> {
        return this.run(context, IncomeRpc.SettleOnline, {} as IIncomeSettleOnlineRes, async (out, uid, sId) => {
            Object.assign(out, await this.store.settleOnline(uid, sId))
        })
    }

    private claimOffline(
        context: LobbyConnectionContext,
        request: IIncomeClaimOfflineReq,
    ): Promise<IIncomeClaimOfflineRes> {
        return this.run(
            context,
            IncomeRpc.ClaimOffline,
            {} as IIncomeClaimOfflineRes,
            async (out, uid, sId) => {
                Object.assign(out, await this.store.claimOffline(uid, sId))
            },
            request,
        )
    }

    /**
     * 统一入口：解析内部 uid → 走 ObjectAction（同 uid 串行 + Redis 提交）→ 成功取数据、失败抛原始错误。
     *
     * 这里刻意**不** `Ctx.bind`：原生 Lobby 的上下文已由 `messageHead.uId/serverId` 给出可信身份，
     * 而 `Ctx.bind` 会额外改写 `UserOnlineMgr`（原生通道的连接 id 恒为 0），属于旧链路的在线表。
     */
    private async run<Res>(
        context: LobbyConnectionContext,
        route: string,
        response: Res,
        action: (response: Res, internalUid: number, sId: number) => Promise<void>,
        request: unknown = {},
    ): Promise<Res> {
        const uid = await this.identities.resolve(context.uid, context.sId)
        const result = await executeObjectAction(
            route,
            request,
            response,
            { doAction: async () => action(response, uid, context.sId) },
            { uid, externalUid: context.uid, sId: context.sId },
        )
        if (result.ok) return lobbyRouteOutcome(result.data, result.sync) as unknown as Res
        throw result.error
    }
}
