import type {
    IRedeemClaimReq,
    IRedeemClaimRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/redeem'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { RedeemNativeLobbyStore } from '../lobby/RedeemNativeLobbyStore'

export class ActionRedeemClaim extends NativeLobbyAction {
    async doAction(req: IRedeemClaimReq, res: IRedeemClaimRes): Promise<void> {
        Object.assign(res, await new RedeemNativeLobbyStore().claim(this.lobbyUid, this.lobbySid, req))
    }
}
