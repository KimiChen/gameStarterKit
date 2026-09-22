import { ActionLogin } from '../../../../src/runtime/action/C2S/base/ActionLogin'
import { ActionDefault } from '../../../../src/runtime/action/C2S/default/ActionDefault'
import { ActionArenaBoard } from '../../../../src/modules/arena/action/ActionArenaBoard'
import { ActionArenaCapture } from '../../../../src/modules/arena/action/ActionArenaCapture'
import { ActionArenaShopBuyBoost } from '../../../../src/modules/arenaShop/action/ActionArenaShopBuyBoost'
import { ActionGuildGetEvents } from '../../../../src/modules/guild/action/ActionGuildGetEvents'
import { ActionGuildJoin } from '../../../../src/modules/guild/action/ActionGuildJoin'
import { ActionGuildLeave } from '../../../../src/modules/guild/action/ActionGuildLeave'
import { ActionIncomeClaimOffline } from '../../../../src/modules/income/action/ActionIncomeClaimOffline'
import { ActionIncomeGetPending } from '../../../../src/modules/income/action/ActionIncomeGetPending'
import { ActionIncomeSettleOnline } from '../../../../src/modules/income/action/ActionIncomeSettleOnline'
import { ActionMailClaimAttach } from '../../../../src/modules/mail/action/ActionMailClaimAttach'
import { ActionMailList } from '../../../../src/modules/mail/action/ActionMailList'
import { ActionMailMarkRead } from '../../../../src/modules/mail/action/ActionMailMarkRead'
import { ActionRedeemClaim } from '../../../../src/modules/redeem/action/ActionRedeemClaim'
import { ActionRoomPrepareCreate } from '../../../../src/modules/room/action/ActionRoomPrepareCreate'
import { ActionRoomResolve } from '../../../../src/modules/room/action/ActionRoomResolve'
import { ActionShopPurchase } from '../../../../src/modules/shop/action/ActionShopPurchase'
import { ActionShopQueryOp } from '../../../../src/modules/shop/action/ActionShopQueryOp'
import { ActionSlgMapTiles } from '../../../../src/modules/slg/action/ActionSlgMapTiles'
import { ActionSlgMarchDispatch } from '../../../../src/modules/slg/action/ActionSlgMarchDispatch'
import { ActionSlgMarchRecall } from '../../../../src/modules/slg/action/ActionSlgMarchRecall'
import { ActionSlgTileCapture } from '../../../../src/modules/slg/action/ActionSlgTileCapture'
import { ActionSnakeCosmeticEquip } from '../../../../src/modules/snakeCosmetic/action/ActionSnakeCosmeticEquip'
import { ActionSnakeCosmeticGetSnapshot } from '../../../../src/modules/snakeCosmetic/action/ActionSnakeCosmeticGetSnapshot'
import { ActionSnakeCosmeticUnlock } from '../../../../src/modules/snakeCosmetic/action/ActionSnakeCosmeticUnlock'
import { ActionUserGetInfo } from '../../../../src/modules/user/action/ActionUserGetInfo'
import { ActionUserGetProfile } from '../../../../src/modules/user/action/ActionUserGetProfile'
import { ActionUserGetUserId } from '../../../../src/modules/user/action/ActionUserGetUserId'
import { ActionUserUpdateProfile } from '../../../../src/modules/user/action/ActionUserUpdateProfile'

export const Actions = {
    'base/Login': ActionLogin,
    'default/Default': ActionDefault,
    'arena.board': ActionArenaBoard,
    'arena.capture': ActionArenaCapture,
    'arenaShop.buyBoost': ActionArenaShopBuyBoost,
    'guild.getEvents': ActionGuildGetEvents,
    'guild.join': ActionGuildJoin,
    'guild.leave': ActionGuildLeave,
    'income.claimOffline': ActionIncomeClaimOffline,
    'income.getPending': ActionIncomeGetPending,
    'income.settleOnline': ActionIncomeSettleOnline,
    'mail.claimAttach': ActionMailClaimAttach,
    'mail.list': ActionMailList,
    'mail.markRead': ActionMailMarkRead,
    'redeem.claim': ActionRedeemClaim,
    'room.prepareCreate': ActionRoomPrepareCreate,
    'room.resolve': ActionRoomResolve,
    'shop.purchase': ActionShopPurchase,
    'shop.queryOp': ActionShopQueryOp,
    'slg.mapTiles': ActionSlgMapTiles,
    'slg.marchDispatch': ActionSlgMarchDispatch,
    'slg.marchRecall': ActionSlgMarchRecall,
    'slg.tileCapture': ActionSlgTileCapture,
    'snakeCosmetic.equip': ActionSnakeCosmeticEquip,
    'snakeCosmetic.getSnapshot': ActionSnakeCosmeticGetSnapshot,
    'snakeCosmetic.unlock': ActionSnakeCosmeticUnlock,
    'user.getInfo': ActionUserGetInfo,
    'user.getProfile': ActionUserGetProfile,
    'user.getUserId': ActionUserGetUserId,
    'user.updateProfile': ActionUserUpdateProfile,
}
