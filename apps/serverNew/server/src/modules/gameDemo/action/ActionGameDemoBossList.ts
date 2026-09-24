import type { ReadonlyBean } from '@arthropoda/game-engine'
import type { GameDemoBossId } from '../../../../generated/lobby-contract/protocol/lobbyRpc/checks/gameDemo'
import type {
    IGameDemoBossList,
    IGameDemoEmptyReq,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoBossLobby } from '../bean/GameDemoBossLobby'
import { GameDemoBossRoom } from '../bean/GameDemoBossRoom'
import { GameDemoBossBattle } from '../rules/GameDemoBossBattle'
import { ActionGameDemo } from './ActionGameDemo'

/** Boss 是共享资源；查询只读，不进入 Boss 串行组。尚未开局的房间按首局默认值展示。 */
export class ActionGameDemoBossList extends ActionGameDemo {
    async doAction(_req: IGameDemoEmptyReq, res: IGameDemoBossList): Promise<void> {
        const rooms = new Map<GameDemoBossId, ReadonlyBean<GameDemoBossRoom> | undefined>()
        for (const bossId of GameDemoBossBattle.bossIds())
            rooms.set(bossId, await GameDemoBossRoom.loadOnlyRead(GameDemoBossBattle.roomId(bossId)))
        const view = GameDemoBossBattle.list(await GameDemoBossLobby.loadOnlyRead(1), rooms, this.requireUser().id)
        res.rooms = view.rooms
        res.currentBossId = view.currentBossId
        res.generation = view.generation
    }
}
