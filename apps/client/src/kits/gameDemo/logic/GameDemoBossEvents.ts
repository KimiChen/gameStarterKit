import type { GameDemoBossEvent, GameDemoBossState } from '../../../shared/kits/gameDemo/api/boss/index';
/** Visual cursor only: reconnect and late snapshots never replay committed combat. */
export class GameDemoBossEvents {
    private runId = '';
    private sequence = -1;
    take(state: GameDemoBossState): GameDemoBossEvent[] {
        const battle = state.room.battle;
        if (!battle) return [];
        if (this.runId !== state.room.runId) {
            this.runId = state.room.runId;
            this.sequence = battle.sequence;
            return [];
        }
        const events = battle.events.filter(
            (e) => e.sequence > this.sequence && state.serverNow - e.at < 2500,
        );
        this.sequence = Math.max(this.sequence, battle.sequence);
        return events;
    }
}
