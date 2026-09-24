import { millisecond } from '@arthropoda/game-engine'
import { GameDemoBossLobby } from '../bean/GameDemoBossLobby'
import { GameDemoBossBattle } from '../rules/GameDemoBossBattle'
import { ActionGameDemoBoss } from './ActionGameDemoBoss'

/** 每秒推进三个房间；只读大厅判断参与者是否仍在本房间。 */
export class ActionGameDemoBossTick extends ActionGameDemoBoss {
    async doAction(): Promise<void> {
        const lobby = await GameDemoBossLobby.loadOnlyRead(1)
        const now = millisecond()
        for (const bossId of GameDemoBossBattle.bossIds()) {
            const room = await this.room(bossId)
            if (lobby) await GameDemoBossBattle.step(lobby, room, bossId, now, ActionGameDemoBoss.heroAttack)
            else if (room.phase === 'settled' && now >= room.respawnAt) GameDemoBossBattle.spawn(room, bossId, now)
            await this.publish(room)
        }
    }
}
