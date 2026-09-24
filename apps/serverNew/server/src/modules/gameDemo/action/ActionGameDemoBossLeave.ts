import type {
    IGameDemoBossLeaveReq,
    IGameDemoBossList,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoBossBattle } from '../rules/GameDemoBossBattle'
import { ActionGameDemoBoss } from './ActionGameDemoBoss'

/** 离开保留本局伤害；返回最新的房间列表。 */
export class ActionGameDemoBossLeave extends ActionGameDemoBoss {
    async doAction(req: IGameDemoBossLeaveReq, res: IGameDemoBossList): Promise<void> {
        const lobby = await this.lobby()
        const room = await this.room(req.bossId)
        GameDemoBossBattle.leave(lobby, room, req.bossId, this.uid, req.generation)
        await this.publish(room)
        const rooms = new Map()
        for (const bossId of GameDemoBossBattle.bossIds()) rooms.set(bossId, await this.room(bossId))
        const view = GameDemoBossBattle.list(lobby, rooms, this.uid)
        res.rooms = view.rooms
        res.currentBossId = view.currentBossId
        res.generation = view.generation
    }
}
