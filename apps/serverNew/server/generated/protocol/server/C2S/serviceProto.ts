import { ServiceProto } from '@arthropoda/game-engine'
import {} from '../../../../src/runtime/protocol/C2S/ModInfo'
import {} from '../../../../src/runtime/protocol/C2S/MsgError'
import { ReqLogin, ResLogin, PushChange } from '../../../../src/runtime/protocol/C2S/base'
import {
    PushLedMsg,
    PushPop,
    PushTipMsg,
    PushErrorStatus,
    PushUnForbid,
} from '../../../../src/runtime/protocol/C2S/commom'
import { ReqDefault, ResDefault } from '../../../../src/runtime/protocol/C2S/default'
import {} from '../../../../src/runtime/protocol/C2S/message'
import {} from '../../../../src/runtime/protocol/C2S/global'
import type {
    IArenaBoardReq,
    IArenaBoardRes,
    IArenaCaptureReq,
    IArenaCaptureRes,
} from '../../../lobby-contract/protocol/lobbyRpc/domains/arena'
import type {
    IArenaShopBuyBoostReq,
    IArenaShopBuyBoostRes,
} from '../../../lobby-contract/protocol/lobbyRpc/domains/arenaShop'
import type { IChatSendReq, IChatSendRes } from '../../../lobby-contract/protocol/lobbyRpc/domains/chat'
import type {
    IGuildGetEventsReq,
    IGuildGetEventsRes,
    IGuildJoinReq,
    IGuildJoinRes,
    IGuildLeaveReq,
    IGuildLeaveRes,
} from '../../../lobby-contract/protocol/lobbyRpc/domains/guild'
import type {
    IHeroRecruitBuyReq,
    IHeroRecruitBuyRes,
    IHeroRecruitGetCatalogReq,
    IHeroRecruitGetCatalogRes,
} from '../../../lobby-contract/protocol/lobbyRpc/domains/heroRecruit'
import type {
    IIncomeClaimOfflineReq,
    IIncomeClaimOfflineRes,
    IIncomeGetPendingReq,
    IIncomeGetPendingRes,
    IIncomeSettleOnlineReq,
    IIncomeSettleOnlineRes,
} from '../../../lobby-contract/protocol/lobbyRpc/domains/income'
import type {
    IMailClaimAttachReq,
    IMailListReq,
    IMailListRes,
    IMailMarkReadReq,
    IMailMarkReadRes,
} from '../../../lobby-contract/protocol/lobbyRpc/domains/mail'
import type {
    IPartyAcceptReq,
    IPartyAcceptRes,
    IPartyCreateReq,
    IPartyCreateRes,
    IPartyDeclineReq,
    IPartyDeclineRes,
    IPartyGetEventsReq,
    IPartyGetEventsRes,
    IPartyGetReq,
    IPartyGetRes,
    IPartyInviteReq,
    IPartyInviteRes,
    IPartyKickReq,
    IPartyLeaveReq,
    IPartyLeaveRes,
    IPartyTransferLeaderReq,
} from '../../../lobby-contract/protocol/lobbyRpc/domains/party'
import type { IRedeemClaimReq, IRedeemClaimRes } from '../../../lobby-contract/protocol/lobbyRpc/domains/redeem'
import type {
    IRoomPrepareCreateReq,
    IRoomPrepareCreateRes,
    IRoomResolveReq,
    IRoomResolveRes,
} from '../../../lobby-contract/protocol/lobbyRpc/domains/room'
import type { IShopPurchaseReq, IShopQueryOpReq } from '../../../lobby-contract/protocol/lobbyRpc/domains/shop'
import type {
    ISlgMapTilesReq,
    ISlgMapTilesRes,
    ISlgMarchDispatchReq,
    ISlgMarchDispatchRes,
    ISlgMarchRecallReq,
    ISlgMarchRecallRes,
    ISlgTileCaptureReq,
    ISlgTileCaptureRes,
} from '../../../lobby-contract/protocol/lobbyRpc/domains/slg'
import type {
    ISnakeCosmeticGetSnapshotReq,
    ISnakeCosmeticProfileRes,
    ISnakeCosmeticSkinReq,
    ISnakeCosmeticSnapshotRes,
} from '../../../lobby-contract/protocol/lobbyRpc/domains/snakeCosmetic'
import type {
    IGetInfoReq,
    IGetInfoRes,
    IGetProfileReq,
    IGetProfileRes,
    IGetUserIdReq,
    IGetUserIdRes,
    IUpdateProfileReq,
    IUpdateProfileRes,
} from '../../../lobby-contract/protocol/lobbyRpc/domains/user'
import type {
    IWorldEnterReq,
    IWorldEnterRes,
    IWorldResolveTransferReq,
    IWorldResolveTransferRes,
} from '../../../lobby-contract/protocol/lobbyRpc/domains/world'
import type { IPurchaseResult } from '../../../lobby-contract/protocol/lobbyRpc/economy'

export interface ServiceType {
    api: {
        'base/Login': {
            req: ReqLogin
            res: ResLogin
        }
        'default/Default': {
            req: ReqDefault
            res: ResDefault
        }
        'arena.board': {
            req: IArenaBoardReq
            res: IArenaBoardRes
        }
        'arena.capture': {
            req: IArenaCaptureReq
            res: IArenaCaptureRes
        }
        'arenaShop.buyBoost': {
            req: IArenaShopBuyBoostReq
            res: IArenaShopBuyBoostRes
        }
        'chat.send': {
            req: IChatSendReq
            res: IChatSendRes
        }
        'guild.getEvents': {
            req: IGuildGetEventsReq
            res: IGuildGetEventsRes
        }
        'guild.join': {
            req: IGuildJoinReq
            res: IGuildJoinRes
        }
        'guild.leave': {
            req: IGuildLeaveReq
            res: IGuildLeaveRes
        }
        'heroRecruit.buy': {
            req: IHeroRecruitBuyReq
            res: IHeroRecruitBuyRes
        }
        'heroRecruit.getCatalog': {
            req: IHeroRecruitGetCatalogReq
            res: IHeroRecruitGetCatalogRes
        }
        'income.claimOffline': {
            req: IIncomeClaimOfflineReq
            res: IIncomeClaimOfflineRes
        }
        'income.getPending': {
            req: IIncomeGetPendingReq
            res: IIncomeGetPendingRes
        }
        'income.settleOnline': {
            req: IIncomeSettleOnlineReq
            res: IIncomeSettleOnlineRes
        }
        'mail.claimAttach': {
            req: IMailClaimAttachReq
            res: IPurchaseResult
        }
        'mail.list': {
            req: IMailListReq
            res: IMailListRes
        }
        'mail.markRead': {
            req: IMailMarkReadReq
            res: IMailMarkReadRes
        }
        'party.accept': {
            req: IPartyAcceptReq
            res: IPartyAcceptRes
        }
        'party.create': {
            req: IPartyCreateReq
            res: IPartyCreateRes
        }
        'party.decline': {
            req: IPartyDeclineReq
            res: IPartyDeclineRes
        }
        'party.get': {
            req: IPartyGetReq
            res: IPartyGetRes
        }
        'party.getEvents': {
            req: IPartyGetEventsReq
            res: IPartyGetEventsRes
        }
        'party.invite': {
            req: IPartyInviteReq
            res: IPartyInviteRes
        }
        'party.kick': {
            req: IPartyKickReq
            res: IPartyAcceptRes
        }
        'party.leave': {
            req: IPartyLeaveReq
            res: IPartyLeaveRes
        }
        'party.transferLeader': {
            req: IPartyTransferLeaderReq
            res: IPartyAcceptRes
        }
        'redeem.claim': {
            req: IRedeemClaimReq
            res: IRedeemClaimRes
        }
        'room.prepareCreate': {
            req: IRoomPrepareCreateReq
            res: IRoomPrepareCreateRes
        }
        'room.resolve': {
            req: IRoomResolveReq
            res: IRoomResolveRes
        }
        'shop.purchase': {
            req: IShopPurchaseReq
            res: IPurchaseResult
        }
        'shop.queryOp': {
            req: IShopQueryOpReq
            res: IPurchaseResult
        }
        'slg.mapTiles': {
            req: ISlgMapTilesReq
            res: ISlgMapTilesRes
        }
        'slg.marchDispatch': {
            req: ISlgMarchDispatchReq
            res: ISlgMarchDispatchRes
        }
        'slg.marchRecall': {
            req: ISlgMarchRecallReq
            res: ISlgMarchRecallRes
        }
        'slg.tileCapture': {
            req: ISlgTileCaptureReq
            res: ISlgTileCaptureRes
        }
        'snakeCosmetic.equip': {
            req: ISnakeCosmeticSkinReq
            res: ISnakeCosmeticProfileRes
        }
        'snakeCosmetic.getSnapshot': {
            req: ISnakeCosmeticGetSnapshotReq
            res: ISnakeCosmeticSnapshotRes
        }
        'snakeCosmetic.unlock': {
            req: ISnakeCosmeticSkinReq
            res: ISnakeCosmeticProfileRes
        }
        'user.getInfo': {
            req: IGetInfoReq
            res: IGetInfoRes
        }
        'user.getProfile': {
            req: IGetProfileReq
            res: IGetProfileRes
        }
        'user.getUserId': {
            req: IGetUserIdReq
            res: IGetUserIdRes
        }
        'user.updateProfile': {
            req: IUpdateProfileReq
            res: IUpdateProfileRes
        }
        'world.enter': {
            req: IWorldEnterReq
            res: IWorldEnterRes
        }
        'world.resolveTransfer': {
            req: IWorldResolveTransferReq
            res: IWorldResolveTransferRes
        }
    }
    push: {
        'base/PushChange': PushChange
        'commom/PushLedMsg': PushLedMsg
        'commom/PushPop': PushPop
        'commom/PushTipMsg': PushTipMsg
        'commom/PushErrorStatus': PushErrorStatus
        'commom/PushUnForbid': PushUnForbid
    }
}
export const serviceProto: ServiceProto = {
    version: 844,
    protocols: [
        {
            name: 'base/Login',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'default/Default',
            type: 'api',
            serviceType: 'undefined',
        },
        {
            name: 'arena.board',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'arena.capture',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'arenaShop.buyBoost',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'chat.send',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'guild.getEvents',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'guild.join',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'guild.leave',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'heroRecruit.buy',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'heroRecruit.getCatalog',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'income.claimOffline',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'income.getPending',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'income.settleOnline',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'mail.claimAttach',
            type: 'api',
            serviceType: 'Mail',
        },
        {
            name: 'mail.list',
            type: 'api',
            serviceType: 'Mail',
        },
        {
            name: 'mail.markRead',
            type: 'api',
            serviceType: 'Mail',
        },
        {
            name: 'party.accept',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'party.create',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'party.decline',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'party.get',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'party.getEvents',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'party.invite',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'party.kick',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'party.leave',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'party.transferLeader',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'redeem.claim',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'room.prepareCreate',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'room.resolve',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'shop.purchase',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'shop.queryOp',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'slg.mapTiles',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'slg.marchDispatch',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'slg.marchRecall',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'slg.tileCapture',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'snakeCosmetic.equip',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'snakeCosmetic.getSnapshot',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'snakeCosmetic.unlock',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'user.getInfo',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'user.getProfile',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'user.getUserId',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'user.updateProfile',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'world.enter',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'world.resolveTransfer',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'base/PushChange',
            type: 'push',
        },
        {
            name: 'commom/PushLedMsg',
            type: 'push',
        },
        {
            name: 'commom/PushPop',
            type: 'push',
        },
        {
            name: 'commom/PushTipMsg',
            type: 'push',
        },
        {
            name: 'commom/PushErrorStatus',
            type: 'push',
        },
        {
            name: 'commom/PushUnForbid',
            type: 'push',
        },
    ],
}
