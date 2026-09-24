import { millisecond } from '@arthropoda/game-engine'
import type {
    IGameDemoBossAttackReq,
    IGameDemoBossState,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoBossBattle } from '../rules/GameDemoBossBattle'
import { ActionGameDemoBoss } from './ActionGameDemoBoss'

/** 手动出剑或设置自动攻击意愿；伤害按提交时的英雄攻击力计算。 */
export class ActionGameDemoBossAttack extends ActionGameDemoBoss {
    async doAction(req: IGameDemoBossAttackReq, res: IGameDemoBossState): Promise<void> {
        const lobby = await this.lobby()
        const room = await this.room(req.bossId)
        const applied = GameDemoBossBattle.attack(
            lobby,
            room,
            req.bossId,
            this.uid,
            req,
            await ActionGameDemoBoss.heroAttack(this.uid),
            millisecond(),
        )
        await this.publish(room)
        await this.respond(lobby, room, req.bossId, applied, res)
    }
}
