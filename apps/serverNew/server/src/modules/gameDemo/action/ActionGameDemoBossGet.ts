import { millisecond } from '@arthropoda/game-engine'
import type {
    IGameDemoBossGetReq,
    IGameDemoBossState,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoBossLobby } from '../bean/GameDemoBossLobby'
import { GameDemoBossRoom } from '../bean/GameDemoBossRoom'
import { GameDemoPlayer } from '../bean/GameDemoPlayer'
import { GameDemoBossBattle } from '../rules/GameDemoBossBattle'
import { GameDemoHeroTraining } from '../rules/GameDemoHeroTraining'
import { ActionGameDemo } from './ActionGameDemo'

export class ActionGameDemoBossGet extends ActionGameDemo {
    async doAction(req: IGameDemoBossGetReq, res: IGameDemoBossState): Promise<void> {
        const uid = this.requireUser().id
        const room = await GameDemoBossRoom.loadOnlyRead(GameDemoBossBattle.roomId(req.bossId))
        const member = GameDemoBossBattle.membership(await GameDemoBossLobby.loadOnlyRead(1), uid)
        const mine = GameDemoBossBattle.myDamage(room, uid)
        res.uid = uid
        res.room = GameDemoBossBattle.view(room, req.bossId)
        res.currentBossId = member.bossId
        res.generation = member.generation
        res.serverNow = millisecond()
        res.nextAttackAt = mine.nextAttackAt
        res.heroAttack = GameDemoHeroTraining.view(await GameDemoPlayer.loadOnlyRead(uid)).attack
        res.myDamage = mine.damage
        res.appliedDamage = 0
    }
}
