import type {
    ISnakeCosmeticGetSnapshotReq,
    ISnakeCosmeticSnapshotRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/snakeCosmetic'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { SnakeCosmeticNativeLobbyStore } from '../lobby/SnakeCosmeticNativeLobbyStore'

export class ActionSnakeCosmeticGetSnapshot extends NativeLobbyAction {
    async doAction(_req: ISnakeCosmeticGetSnapshotReq, res: ISnakeCosmeticSnapshotRes): Promise<void> {
        Object.assign(res, await new SnakeCosmeticNativeLobbyStore().snapshot(this.lobbyUid, this.lobbySid))
    }
}
