import type { IMmoScriptStateSnapshot } from "../../../kits/mmo/api/orchestration/index";
import { MMO_HOLD_PACK_ID, type MmoHoldOwner } from "../../../shared/protocol/lobbyRpc/domains/mmohold";

export interface HoldHudState {
    readonly ready: boolean;
    readonly connected: boolean;
    readonly dawn: number;
    readonly dusk: number;
    readonly pointA: MmoHoldOwner;
    readonly pointB: MmoHoldOwner;
    readonly closed: boolean;
    readonly winner: MmoHoldOwner;
    readonly round: number;
    readonly reopenIn: number;
}

function natural(value: unknown, max: number): number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? Math.min(value, max) : 0;
}
function owner(value: unknown): MmoHoldOwner { return value === "dawn" || value === "dusk" ? value : "neutral"; }
export function holdOwnerLabel(value: MmoHoldOwner): string { return value === "dawn" ? "曙光" : value === "dusk" ? "暮光" : "中立"; }

/** 只展示当前房间发来的快照；断线即撤旧比分，避免把上一分线误当成实时值。 */
export class MmoHoldHudLogic {
    onChanged: () => void = () => {};
    private unsubscribe: (() => void) | null = null;
    private snapshot: IMmoScriptStateSnapshot | null = null;

    constructor(private readonly subscribe: (packId: string, listener: (snapshot: IMmoScriptStateSnapshot) => void) => () => void) {}

    mount(): void {
        if (this.unsubscribe) return;
        this.unsubscribe = this.subscribe(MMO_HOLD_PACK_ID, (snapshot) => {
            if (snapshot.packId !== MMO_HOLD_PACK_ID) return;
            this.snapshot = snapshot;
            this.onChanged();
        });
    }
    unmount(): void { this.unsubscribe?.(); this.unsubscribe = null; this.snapshot = null; }

    state(): HoldHudState {
        const snapshot = this.snapshot;
        const ready = snapshot?.connected === true && snapshot.rev !== null;
        const data = ready ? snapshot.state : {};
        return {
            ready, connected: snapshot?.connected ?? true,
            dawn: natural(data["score:dawn"], 100), dusk: natural(data["score:dusk"], 100),
            pointA: owner(data["owner:pointA"]), pointB: owner(data["owner:pointB"]),
            closed: data.phase === "closed", winner: owner(data.winner),
            round: natural(data.round, Number.MAX_SAFE_INTEGER) || 1,
            reopenIn: natural(data.reopenIn, 60),
        };
    }
    headline(): string {
        const state = this.state();
        if (!state.connected) return "连接中断，等待重连…";
        if (!state.ready) return "正在同步据点…";
        return state.closed ? `${holdOwnerLabel(state.winner)}获胜 · ${state.reopenIn} 秒后重开` : `第 ${state.round} 轮 · 先到 100 分获胜`;
    }
}
