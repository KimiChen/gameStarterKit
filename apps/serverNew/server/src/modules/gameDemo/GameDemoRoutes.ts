import { GameDemoGuild } from './guild/GameDemoGuild'
import {
    GameDemoGuildRpc,
    type IGameDemoGuildCreateReq,
    type IGameDemoGuildInviteReq,
    type IGameDemoGuildRespondReq,
    type IGameDemoGuildLeaveReq,
} from '../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoGuild'
import { GameDemoSeason } from './season/GameDemoSeason'
import {
    GameDemoSeasonRpc,
    type IGameDemoSeasonEndReq,
} from '../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoSeason'
import {
    executeObjectAction,
    lobbyRouteOutcome,
    recordObjectActionSync,
    type LobbyConnectionContext,
} from '@arthropoda/game-engine'
import {
    GameDemoRpc,
    type IGameDemoInitializeReq,
    type IGameDemoBuyReq,
    validateGameDemoAssetsRes,
    validateGameDemoMailboxRes,
    validateGameDemoMailClaimRes,
    type IGameDemoMailReq,
} from '../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemo'
import type { NativeLobbyIdentityResolver } from '../../runtime/identity/NativeLobbyAuthProvider'
import type { NativeLobbyRouteRegistry } from '../../runtime/lobby/NativeLobbyRouteRegistry'
import { nativeObjectBinding } from '../../runtime/lobby/NativeLobbyRoomHost'
import { GameDemoAccount } from './growth/GameDemoAccount'
import { GameDemoShop } from './shop/GameDemoShop'
import { GameDemoMailbox } from './rewards/GameDemoMailbox'
import { GameDemoHero } from './hero/GameDemoHero'
import { GameDemoAlchemy } from './alchemy/GameDemoAlchemy'
import {
    GameDemoHeroRpc,
    validateGameDemoUpgradeRes,
    type IGameDemoHeroUpgradeReq,
} from '../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoHero'
import {
    GameDemoAlchemyRpc,
    validateGameDemoAlchemyRes,
    type IGameDemoAlchemyStartReq,
    type IGameDemoAlchemyFinishReq,
} from '../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoAlchemy'

export class GameDemoRoutes {
    constructor(private readonly identities: NativeLobbyIdentityResolver) {}

    register(registry: NativeLobbyRouteRegistry): void {
        registry.register(GameDemoGuildRpc.Get, (c) =>
            this.run(c, GameDemoGuildRpc.Get, {}, () => new GameDemoGuild().read(c.uid, c.sId), false),
        )
        registry.register(GameDemoGuildRpc.Create, (c, req) =>
            this.run(
                c,
                GameDemoGuildRpc.Create,
                req,
                () => new GameDemoGuild().create(c.uid, c.sId, req as IGameDemoGuildCreateReq),
                false,
            ),
        )
        registry.register(GameDemoGuildRpc.Invite, (c, req) =>
            this.run(
                c,
                GameDemoGuildRpc.Invite,
                req,
                () => new GameDemoGuild().invite(c.uid, c.sId, req as IGameDemoGuildInviteReq),
                false,
            ),
        )
        registry.register(GameDemoGuildRpc.Respond, (c, req) =>
            this.run(
                c,
                GameDemoGuildRpc.Respond,
                req,
                () => new GameDemoGuild().respond(c.uid, c.sId, req as IGameDemoGuildRespondReq),
                false,
            ),
        )
        registry.register(GameDemoGuildRpc.Leave, (c, req) =>
            this.run(
                c,
                GameDemoGuildRpc.Leave,
                req,
                () => new GameDemoGuild().leave(c.uid, c.sId, req as IGameDemoGuildLeaveReq),
                false,
            ),
        )
        registry.register(GameDemoSeasonRpc.Get, (c) =>
            this.run(c, GameDemoSeasonRpc.Get, {}, () => new GameDemoSeason().read(c.uid, c.sId), false),
        )
        registry.register(GameDemoSeasonRpc.End, (c, req) =>
            this.run(
                c,
                GameDemoSeasonRpc.End,
                req,
                () =>
                    new GameDemoSeason().end(
                        c.uid,
                        c.sId,
                        req as IGameDemoSeasonEndReq,
                        process.env.GAME_DEMO_DEV_TOOLS === '1',
                    ),
                false,
            ),
        )
        registry.register(GameDemoHeroRpc.Get, (c) =>
            this.run(c, GameDemoHeroRpc.Get, {}, () => new GameDemoHero().read(c.uid, c.sId), false),
        )
        registry.register(GameDemoHeroRpc.Upgrade, (c, req) =>
            this.run(
                c,
                GameDemoHeroRpc.Upgrade,
                req,
                () => new GameDemoHero().upgrade(c.uid, c.sId, req as IGameDemoHeroUpgradeReq),
                'hero',
            ),
        )
        registry.register(GameDemoAlchemyRpc.Get, (c) =>
            this.run(c, GameDemoAlchemyRpc.Get, {}, () => new GameDemoAlchemy().read(c.uid, c.sId), false),
        )
        registry.register(GameDemoAlchemyRpc.Start, (c, req) =>
            this.run(
                c,
                GameDemoAlchemyRpc.Start,
                req,
                () => new GameDemoAlchemy().start(c.uid, c.sId, req as IGameDemoAlchemyStartReq),
                'alchemy',
            ),
        )
        registry.register(GameDemoAlchemyRpc.Finish, (c, req) =>
            this.run(
                c,
                GameDemoAlchemyRpc.Finish,
                req,
                () => new GameDemoAlchemy().finish(c.uid, c.sId, req as IGameDemoAlchemyFinishReq),
                'alchemy',
            ),
        )
        registry.register(GameDemoRpc.Assets, (c) =>
            this.run(c, GameDemoRpc.Assets, {}, (account) => account.read(c.uid, c.sId), false),
        )
        registry.register(GameDemoRpc.Initialize, (c, payload) => {
            const req = payload as IGameDemoInitializeReq
            return this.run(
                c,
                GameDemoRpc.Initialize,
                req,
                (account) => account.initialize(c.uid, c.sId, req.clientReqId, process.env.GAME_DEMO_DEV_TOOLS === '1'),
                'assets',
            )
        })
        registry.register(GameDemoRpc.Shop, (c) =>
            this.run(c, GameDemoRpc.Shop, {}, () => new GameDemoShop().read(c.uid, c.sId), false),
        )
        registry.register(GameDemoRpc.Buy, (c, payload) =>
            this.run(
                c,
                GameDemoRpc.Buy,
                payload,
                () => new GameDemoShop().buy(c.uid, c.sId, payload as IGameDemoBuyReq),
                'assets',
            ),
        )
        registry.register(GameDemoRpc.MailList, (c) =>
            this.run(c, GameDemoRpc.MailList, {}, () => new GameDemoMailbox().read(c.uid, c.sId), false),
        )
        registry.register(GameDemoRpc.MailRead, (c, payload) =>
            this.run(
                c,
                GameDemoRpc.MailRead,
                payload,
                () => new GameDemoMailbox().markRead(c.uid, c.sId, payload as IGameDemoMailReq),
                'mail',
            ),
        )
        registry.register(GameDemoRpc.MailClaim, (c, payload) =>
            this.run(
                c,
                GameDemoRpc.MailClaim,
                payload,
                () => new GameDemoMailbox().claim(c.uid, c.sId, payload as IGameDemoMailReq),
                'claim',
            ),
        )
    }

    private async run<Res extends object>(
        c: LobbyConnectionContext,
        route: string,
        req: unknown,
        action: (account: GameDemoAccount) => Promise<Res>,
        write: 'assets' | 'mail' | 'claim' | 'hero' | 'alchemy' | false,
    ) {
        const uid = await this.identities.resolve(c.uid, c.sId)
        const result = await executeObjectAction(
            route,
            req,
            {} as Res,
            {
                getBindId: async () => nativeObjectBinding(uid),
                doAction: async (_request, response) => {
                    const committed = await action(new GameDemoAccount())
                    Object.assign(response, committed)
                    if (write === 'hero') {
                        const upgraded = validateGameDemoUpgradeRes(committed)
                        recordObjectActionSync({
                            gameDemoAssets: upgraded.assets,
                            gameDemoHero: upgraded.hero,
                            versions: {
                                gameDemoAssets: upgraded.assets.revision,
                                gameDemoHero: upgraded.hero.revision,
                            },
                        })
                    } else if (write === 'alchemy') {
                        const alchemy = validateGameDemoAlchemyRes(committed)
                        recordObjectActionSync({
                            gameDemoAssets: alchemy.assets,
                            gameDemoAlchemy: alchemy,
                            versions: { gameDemoAssets: alchemy.assets.revision, gameDemoAlchemy: alchemy.revision },
                        })
                    } else if (write === 'assets') {
                        const assets = validateGameDemoAssetsRes(committed)
                        recordObjectActionSync({
                            gameDemoAssets: assets,
                            versions: { gameDemoAssets: assets.revision },
                        })
                        if (route === GameDemoRpc.Initialize) {
                            const mailbox = await new GameDemoMailbox().read(c.uid, c.sId)
                            recordObjectActionSync({
                                gameDemoMail: mailbox,
                                versions: { gameDemoMail: mailbox.revision },
                            })
                        }
                    } else if (write === 'mail') {
                        const mailbox = validateGameDemoMailboxRes(committed)
                        recordObjectActionSync({ gameDemoMail: mailbox, versions: { gameDemoMail: mailbox.revision } })
                    } else if (write === 'claim') {
                        const { assets, mailbox } = validateGameDemoMailClaimRes(committed)
                        recordObjectActionSync({
                            gameDemoAssets: assets,
                            gameDemoMail: mailbox,
                            versions: { gameDemoAssets: assets.revision, gameDemoMail: mailbox.revision },
                        })
                    }
                },
            },
            { uid, externalUid: c.uid, sId: c.sId },
        )
        if (result.ok) return lobbyRouteOutcome(result.data, result.sync)
        throw result.error
    }
}
