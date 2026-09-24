import type {
    IGameDemoBossEnterReq,
    IGameDemoBossState,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoBossBattle } from '../rules/GameDemoBossBattle'
import { ActionGameDemoBoss } from './ActionGameDemoBoss'

export class ActionGameDemoBossEnter extends ActionGameDemoBoss {
    async doAction(req: IGameDemoBossEnterReq, res: IGameDemoBossState): Promise<void> {
        if (!(await this.isInitialized(this.uid))) throw { code: 'GAME_DEMO_NOT_INITIALIZED', msg: '请先领取玩法资源' }
        const lobby = await this.lobby()
        const room = await this.room(req.bossId)
        GameDemoBossBattle.enter(lobby, room, req.bossId, this.uid)
        await this.publish(room)
        await this.respond(lobby, room, req.bossId, 0, res)
    }
}
