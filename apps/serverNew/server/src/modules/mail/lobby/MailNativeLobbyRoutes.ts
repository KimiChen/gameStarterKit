import { executeObjectAction, type LobbyConnectionContext } from '@arthropoda/game-engine'
import {
    MailRpc,
    type IMailClaimAttachReq,
    type IMailListReq,
    type IMailListRes,
    type IMailMarkReadReq,
    type IMailMarkReadRes,
    type IPurchaseResult,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import type { NativeLobbyIdentityResolver } from '../../../runtime/identity/NativeLobbyAuthProvider'
import type { NativeLobbyRouteRegistry } from '../../../runtime/lobby/NativeLobbyRouteRegistry'
import { MailNativeLobbyStore } from './MailNativeLobbyStore'
export class MailNativeLobbyRoutes {
    constructor(
        private readonly identities: NativeLobbyIdentityResolver,
        private readonly store: MailNativeLobbyStore,
    ) {}
    register(registry: NativeLobbyRouteRegistry): void {
        registry.register(MailRpc.List, (c, p) =>
            this.run(c, MailRpc.List, p as IMailListReq, { mails: [] } as IMailListRes, async (req, res) => {
                Object.assign(res, await this.store.list(c.uid, c.sId, req))
            }),
        )
        registry.register(MailRpc.MarkRead, (c, p) =>
            this.run(
                c,
                MailRpc.MarkRead,
                p as IMailMarkReadReq,
                { ok: false } as IMailMarkReadRes,
                async (req, res) => {
                    await this.store.markRead(c.uid, c.sId, req.mailId)
                    res.ok = true
                },
            ),
        )
        registry.register(MailRpc.ClaimAttach, (c, p) =>
            this.run(
                c,
                MailRpc.ClaimAttach,
                p as IMailClaimAttachReq,
                { opId: '', status: 'dead', balance: 0 } as IPurchaseResult,
                async (req, res) => {
                    Object.assign(res, await this.store.claim(c.uid, c.sId, req.mailId))
                },
            ),
        )
    }
    private async run<Req, Res>(
        c: LobbyConnectionContext,
        route: string,
        req: Req,
        res: Res,
        action: (req: Req, res: Res) => Promise<void>,
    ): Promise<Res> {
        const uid = await this.identities.resolve(c.uid, c.sId)
        const result = await executeObjectAction(
            route,
            req,
            res,
            { doAction: action },
            { uid, externalUid: c.uid, sId: c.sId },
        )
        if (result.ok) return result.data
        throw result.error
    }
}
