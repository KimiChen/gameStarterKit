import { executeObjectAction, lobbyRouteOutcome, type LobbyConnectionContext } from '@arthropoda/game-engine'
import {
    UserRpc,
    type IGetInfoRes,
    type IGetProfileRes,
    type IGetUserIdRes,
    type IUpdateProfileReq,
    type IUpdateProfileRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import type { NativeLobbyRouteRegistry } from '../../../runtime/lobby/NativeLobbyRouteRegistry'
import type { NativeLobbyIdentityResolver } from '../../../runtime/identity/NativeLobbyAuthProvider'
import type { NativeLobbyUserStore } from './NativeLobbyUserStore'

/** user 域的原生 Lobby handler；所有入口先经过 ObjectAction，保留 ServerTask 生命周期。 */
export class UserNativeLobbyRoutes {
    constructor(
        private readonly identities: NativeLobbyIdentityResolver,
        private readonly users: NativeLobbyUserStore,
    ) {}

    register(registry: NativeLobbyRouteRegistry): void {
        registry.register(UserRpc.GetUserId, (context) => this.getUserId(context))
        registry.register(UserRpc.GetInfo, (context) => this.getInfo(context))
        registry.register(UserRpc.GetProfile, (context, payload) =>
            this.getProfile(context, payload as { uid: string }),
        )
        registry.register(UserRpc.UpdateProfile, (context, payload) =>
            this.updateProfile(context, payload as IUpdateProfileReq),
        )
    }

    private async getUserId(context: LobbyConnectionContext): Promise<IGetUserIdRes> {
        return this.run(context, UserRpc.GetUserId, {}, { uid: context.uid }, async () => undefined)
    }

    private async getInfo(context: LobbyConnectionContext): Promise<IGetInfoRes> {
        return this.run(
            context,
            UserRpc.GetInfo,
            {},
            { user: undefined as unknown as IGetInfoRes['user'] },
            async (_request, response) => {
                response.user = await this.users.require(context.uid, context.sId)
            },
        )
    }

    private async getProfile(context: LobbyConnectionContext, request: { uid: string }): Promise<IGetProfileRes> {
        return this.run<{ uid: string }, IGetProfileRes>(
            context,
            UserRpc.GetProfile,
            request,
            { profile: null },
            async (_request, response) => {
                response.profile = await this.users.getPublic(request.uid, context.sId)
            },
        )
    }

    private async updateProfile(
        context: LobbyConnectionContext,
        request: IUpdateProfileReq,
    ): Promise<IUpdateProfileRes> {
        return this.run<IUpdateProfileReq, IUpdateProfileRes>(
            context,
            UserRpc.UpdateProfile,
            request,
            { ok: false },
            async (_request, response) => {
                await this.users.update(context.uid, context.sId, request)
                response.ok = true
            },
        )
    }

    private async run<Req, Res>(
        context: LobbyConnectionContext,
        route: string,
        request: Req,
        response: Res,
        action: (request: Req, response: Res) => Promise<void>,
    ): Promise<Res> {
        const uid = await this.identities.resolve(context.uid, context.sId)
        const result = await executeObjectAction(
            route,
            request,
            response,
            { doAction: action },
            { uid, externalUid: context.uid, sId: context.sId },
        )
        if (result.ok) return lobbyRouteOutcome(result.data, result.sync) as unknown as Res
        throw result.error
    }
}
