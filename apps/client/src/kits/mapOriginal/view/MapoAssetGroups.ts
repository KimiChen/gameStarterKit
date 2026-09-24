import { AssetLoadError, type AssetLease, type AssetRequest, type AssetBatch } from "../../../view/scene3d/AssetLease";

export type MapoGroupState = "idle" | "loading" | "ready" | "releasing";
export interface MapoAssetGroup {
    readonly requests: readonly AssetRequest[];
    readonly dependencies?: readonly string[];
    install(assets: AssetBatch<readonly AssetRequest[]>["assets"]): void;
    clear(): void;
}
interface Slot {
    state: MapoGroupState;
    generation: number;
    abort?: AbortController;
    lease?: AssetBatch<readonly AssetRequest[]>;
    retiringHolds?: number;
    unusedAt?: number;
    retryAt: number;
    error?: unknown;
}

/** 地图组调度器只管需求/代次；加载、取消、超时和引用归还均经过框架 AssetLease。 */
export class MapoAssetGroups {
    private readonly slots = new Map<string, Slot>();
    private wanted = new Set<string>();
    private closed = false;
    private now = 0;

    constructor(private readonly groups: Readonly<Record<string, MapoAssetGroup>>,
        private readonly lease: AssetLease,
        private readonly retire: (group: string, release: () => void) => void,
        private readonly changed: () => void,
        private readonly onError: (group: string, error: unknown) => void,
        readonly graceMs = 5000, readonly deadlineMs = 15000) {
        for (const group of Object.keys(groups)) this.slots.set(group, { state: "idle", generation: 0, retryAt: 0 });
        for (const [name, group] of Object.entries(groups)) {
            for (const dependency of group.dependencies ?? []) {
                if (!groups[dependency] || dependency === name) throw new Error(`mapOriginal invalid dependency ${name}:${dependency}`);
            }
        }
    }

    ready(group: string): boolean { return this.slots.get(group)?.state === "ready"; }

    update(wanted: readonly string[], now: number): void {
        if (this.closed) return;
        this.now = now;
        this.wanted = new Set();
        const visit = (name: string) => {
            if (!this.groups[name]) throw new Error(`mapOriginal unknown asset group ${name}`);
            if (this.wanted.has(name)) return;
            this.wanted.add(name);
            for (const dependency of this.groups[name]!.dependencies ?? []) visit(dependency);
        };
        for (const name of wanted) visit(name);
        this.reconcile();
    }

    private reconcile(): void {
        if (this.closed) return;
        for (const [name, slot] of this.slots) {
            if (this.wanted.has(name)) {
                slot.unusedAt = undefined;
                if (slot.state === "idle" && this.now >= slot.retryAt
                    && (this.groups[name]!.dependencies ?? []).every((d) => this.ready(d))) this.start(name, slot);
            } else if (slot.state === "loading") {
                slot.generation++; slot.abort?.abort(); slot.abort = undefined; slot.state = "idle";
            } else if (slot.state === "ready") {
                slot.unusedAt ??= this.now;
                if (this.now - slot.unusedAt >= this.graceMs) this.release(name, slot);
            }
        }
    }

    private start(name: string, slot: Slot): void {
        const generation = ++slot.generation;
        const abort = new AbortController();
        slot.abort = abort; slot.state = "loading"; slot.error = undefined;
        void this.lease.acquire(this.groups[name]!.requests, { signal: abort.signal, deadlineMs: this.deadlineMs }).then((batch) => {
            if (this.closed || slot.generation !== generation || !this.wanted.has(name)) { batch.release(); return; }
            try { this.groups[name]!.install(batch.assets); }
            catch (error) {
                this.groups[name]!.clear(); batch.release(); this.failed(name, slot, generation, error); return;
            }
            slot.abort = undefined; slot.lease = batch; slot.state = "ready";
            this.changed(); this.reconcile();
        }, (error: unknown) => this.failed(name, slot, generation, error));
    }

    private failed(name: string, slot: Slot, generation: number, error: unknown): void {
        if (this.closed || slot.generation !== generation) return;
        slot.abort = undefined; slot.state = "idle"; slot.error = error; slot.retryAt = this.now + 1000;
        if (!(error instanceof AssetLoadError && error.code === "ASSET_CANCELLED")) this.onError(name, error);
        this.changed();
    }

    private release(name: string, slot: Slot): void {
        const batch = slot.lease!;
        slot.retiringHolds = batch.assets.length;
        slot.lease = undefined; slot.state = "releasing";
        const generation = ++slot.generation;
        this.groups[name]!.clear();
        this.retire(name, () => {
            batch.release();
            slot.retiringHolds = 0;
            if (slot.generation === generation) { slot.state = "idle"; slot.unusedAt = undefined; }
            this.changed(); this.reconcile();
        });
    }

    snapshot(): Readonly<Record<string, { state: MapoGroupState; wanted: boolean; holds: number; error: string | null }>> {
        const out: Record<string, { state: MapoGroupState; wanted: boolean; holds: number; error: string | null }> = {};
        for (const [name, slot] of this.slots) out[name] = {
            state: slot.state, wanted: this.wanted.has(name),
            holds: slot.lease?.assets.length ?? slot.retiringHolds ?? 0, error: slot.error ? String(slot.error) : null,
        };
        return out;
    }

    close(): void {
        if (this.closed) return;
        this.closed = true; this.wanted.clear();
        for (const [name, slot] of this.slots) {
            if (slot.state === "loading") { slot.generation++; slot.abort?.abort(); slot.abort = undefined; slot.state = "idle"; }
            else if (slot.state === "ready") this.release(name, slot);
        }
    }
}
