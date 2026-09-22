import type {
    ISnakeCosmeticProfileRes,
    ISnakeCosmeticSkinReq,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/snakeCosmetic'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { SnakeCosmeticNativeLobbyStore } from '../lobby/SnakeCosmeticNativeLobbyStore'

export class ActionSnakeCosmeticUnlock extends NativeLobbyAction {
    async doAction(req: ISnakeCosmeticSkinReq, res: ISnakeCosmeticProfileRes): Promise<void> {
        Object.assign(res, await new SnakeCosmeticNativeLobbyStore().unlock(this.lobbyUid, this.lobbySid, req.skinId))
    }
}
