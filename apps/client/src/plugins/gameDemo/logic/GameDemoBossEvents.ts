import type {
    IGameDemoBossEvent,
    IGameDemoBossState,
} from "../../../shared/protocol/lobbyRpc/domains/gameDemo";

/** 只做表现游标：重连与迟到快照不会重放已提交的战斗。 */
export class GameDemoBossEvents {
    private runNumber = 0;
    private sequence = -1;
    take(state: IGameDemoBossState): IGameDemoBossEvent[] {
        const events = state.room.events;
        const latest = events.length ? events[events.length - 1].sequence : 0;
        if (this.runNumber !== state.room.runNumber) {
            this.runNumber = state.room.runNumber;
            this.sequence = latest;
            return [];
        }
        const fresh = events.filter((e) => e.sequence > this.sequence && state.serverNow - e.at < 2500);
        this.sequence = Math.max(this.sequence, latest);
        return fresh;
    }
}
