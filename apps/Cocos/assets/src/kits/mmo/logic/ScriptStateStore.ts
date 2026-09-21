import type { IMmoWorldScriptState } from "../../../shared/gameplays/mmoWorld/wire";
import type { IMmoScriptStateSnapshot, IMmoScriptStateSource } from "../api/orchestration/index";

/** 单房间、单连接代际缓存。入站已由 WorldRoomTransport 的 wire validator 校验。 */
export class ScriptStateStore implements IMmoScriptStateSource {
    private readonly snapshots = new Map<string, IMmoScriptStateSnapshot>();
    private readonly listeners = new Map<string, Set<(snapshot: IMmoScriptStateSnapshot) => void>>();
    private closed = false;

    constructor(private connected: boolean) {}

    subscribeScriptState(packId: string, listener: (snapshot: IMmoScriptStateSnapshot) => void): () => void {
        if (this.closed) return () => undefined;
        let listeners = this.listeners.get(packId);
        if (!listeners) { listeners = new Set(); this.listeners.set(packId, listeners); }
        // 每次订阅独立占有一个槽；同一回调被两个 View 使用时，解绑其中一个不会收走另一个。
        const subscription = (snapshot: IMmoScriptStateSnapshot): void => listener(snapshot);
        listeners.add(subscription);
        this.deliver(subscription, this.snapshot(packId));
        return () => { listeners.delete(subscription); if (listeners.size === 0 && this.listeners.get(packId) === listeners) this.listeners.delete(packId); };
    }

    accept(payload: IMmoWorldScriptState): void {
        if (this.closed || !this.connected) return;
        const previous = this.snapshots.get(payload.packId);
        if (previous && previous.rev !== null && payload.rev <= previous.rev) return;
        const snapshot = Object.freeze({ packId: payload.packId, rev: payload.rev, state: Object.freeze({ ...payload.state }), connected: true });
        this.snapshots.set(payload.packId, snapshot);
        for (const listener of [...(this.listeners.get(payload.packId) ?? [])]) this.deliver(listener, snapshot);
    }

    connection(connected: boolean): void {
        if (this.closed || this.connected === connected) return;
        this.connected = connected;
        this.snapshots.clear();
        for (const [packId, listeners] of [...this.listeners]) {
            const snapshot = this.snapshot(packId);
            for (const listener of [...listeners]) this.deliver(listener, snapshot);
        }
    }

    dispose(): void {
        if (this.closed) return;
        this.connection(false);
        this.closed = true;
        this.snapshots.clear();
        this.listeners.clear();
    }

    private snapshot(packId: string): IMmoScriptStateSnapshot {
        return this.snapshots.get(packId) ?? Object.freeze({ packId, rev: null, state: Object.freeze({}), connected: this.connected });
    }

    private deliver(listener: (snapshot: IMmoScriptStateSnapshot) => void, snapshot: IMmoScriptStateSnapshot): void {
        try { listener(snapshot); } catch (error) { console.error("[mmo scriptState] 订阅回调失败", error); }
    }
}
