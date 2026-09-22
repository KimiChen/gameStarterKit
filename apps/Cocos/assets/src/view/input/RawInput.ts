/** Shared raw pointer route for ViewMgr pages and gameplay presentations, before their routers. */
import type { EventMouse, EventTouch } from "cc";
import { PointerOwnership, type PointerOwner, type PointerPhase } from "../../logic/input/PointerOwnership";
export type { PointerOwner, PointerPhase } from "../../logic/input/PointerOwnership";

export interface RawInputOwner {
    readonly signal: AbortSignal;
    isActive(): boolean;
}
export interface RawInputSubscriber {
    /** Original Cocos event: getID() and getUILocation() preserve pointer identity/design pixels. */
    touch(phase: PointerPhase, event: EventTouch): void;
    wheel?(event: EventMouse): void;
    /** Always clear local router, joystick and held actions, including when owner has expired. */
    cancel(): void;
    inspect?(): unknown;
}
export interface RawInputPort {
    subscribe(owner: RawInputOwner, subscriber: RawInputSubscriber): () => void;
}
interface WorldOwner {
    readonly generation: number;
    readonly owner: RawInputOwner;
    readonly subscriber: RawInputSubscriber;
    detach(): void;
}
interface PendingPointer {
    readonly owner: PointerOwner;
    readonly event: EventTouch;
    readonly world: WorldOwner | null;
}

/** Cocos reuses EventTouch while iterating getTouches(); cancellation must retain the original ID/position. */
function cancellationSnapshot(event: EventTouch, id: number): EventTouch {
    const ui = event.getUILocation();
    const raw = event as EventTouch & { getLocation?: () => { x: number; y: number } };
    const location = raw.getLocation?.();
    const uiX = ui.x, uiY = ui.y, x = location?.x ?? uiX, y = location?.y ?? uiY;
    return Object.create(event, {
        getID: { value: () => id }, getUILocation: { value: () => ({ x: uiX, y: uiY }) },
        getLocation: { value: () => ({ x, y }) },
    }) as EventTouch;
}

export class RawInputRouter implements RawInputPort {
    private world: WorldOwner | null = null;
    private worldGeneration = 0;
    private adapterGeneration = 0;
    private adapterActive = false;
    private capturing = false;
    private blocked = false;
    private suspended = false;
    private cancelling = false;
    private cancelHud: ((id: number, event: EventTouch) => void) | null = null;
    private readonly pending = new Map<number, PendingPointer>();
    private readonly counters = { worldStarts: 0, worldMoves: 0, worldEnds: 0, worldCancels: 0, worldWheels: 0, hudStarts: 0, cancellations: 0 };
    private readonly ownership = new PointerOwnership((id, owner) => {
        const pointer = this.pending.get(id);
        this.pending.delete(id);
        if (!pointer) return;
        if (owner === "hud") this.cancelHud?.(id, pointer.event);
        else if (pointer.world) {
            this.counters.worldCancels++;
            pointer.world.subscriber.touch("cancel", pointer.event);
        }
    });

    /** Replacement never revives an old subscription; releasing its stale token is inert. */
    subscribe(owner: RawInputOwner, subscriber: RawInputSubscriber): () => void {
        if (owner.signal.aborted || !owner.isActive()) throw new Error("Raw input owner is inactive");
        const generation = ++this.worldGeneration;
        const previous = this.world;
        this.world = null;
        previous?.detach();
        this.cancelOwned(previous);
        const token: WorldOwner = { generation, owner, subscriber,
            detach: () => owner.signal.removeEventListener("abort", release) };
        const release = (): void => {
            token.detach();
            if (this.world !== token) return;
            this.world = null;
            this.worldGeneration++;
            this.cancelOwned(token);
        };
        // Cancel callbacks may synchronously subscribe another world or close this owner.
        if (this.worldGeneration === generation && !owner.signal.aborted && owner.isActive()) {
            this.world = token;
            owner.signal.addEventListener("abort", release, { once: true });
        }
        return release;
    }

    private cancelOwned(target: WorldOwner | null): void {
        const nested = this.cancelling;
        this.cancelling = true;
        this.counters.cancellations++;
        let failure: unknown;
        const attempt = (action: () => void): void => {
            try { action(); } catch (error) { failure ??= error; }
        };
        try {
            attempt(() => this.ownership.cancelAll());
            attempt(() => target?.subscriber.cancel());
        } finally {
            if (!nested) this.pending.clear();
            this.cancelling = nested;
        }
        if (failure) console.error("[raw-input] cancellation failed", failure);
    }

    cancel(): void { this.cancelOwned(this.world); }
    /** World modal gate; HUD events on/above the modal boundary still run through ownership. */
    setBlocked(value: boolean): void {
        if (this.blocked === value) return;
        this.blocked = value;
        this.cancel();
    }
    /** Hide/drop gate. Cancel before the host sets its business-input hold. */
    setSuspended(value: boolean): void {
        if (this.suspended === value) return;
        this.suspended = value;
        this.cancel();
    }
    get isBlocked(): boolean { return this.blocked; }
    get isSuspended(): boolean { return this.suspended; }
    get isUiCapturing(): boolean { return this.adapterActive && this.capturing; }
    setUiCapturing(value: boolean): void { this.capturing = value; }
    peek(id: number): PointerOwner | null { return this.pending.get(id)?.owner ?? null; }

    attachAdapter(cancelHud: (id: number, event: EventTouch) => void): () => void {
        this.cancel();
        const generation = ++this.adapterGeneration;
        this.adapterActive = true;
        this.cancelHud = cancelHud;
        return () => {
            if (generation !== this.adapterGeneration) return;
            this.adapterActive = false;
            this.cancel();
            if (generation === this.adapterGeneration) this.cancelHud = null;
        };
    }

    private currentWorld(): WorldOwner | null {
        const token = this.world;
        if (token && (token.owner.signal.aborted || !token.owner.isActive())) {
            this.world = null;
            token.detach();
            this.cancelOwned(token);
        }
        return this.world;
    }

    routeTouch(phase: PointerPhase, event: EventTouch, hit: PointerOwner): PointerOwner | null {
        if (this.suspended || this.cancelling) return null;
        const world = this.currentWorld();
        if (this.suspended || this.cancelling) return null;
        if (phase === "start" && hit === "world" && this.blocked) return null;
        const id = event.getID();
        if (id === null || !Number.isInteger(id)) return null;
        const before = this.counters.cancellations;
        const owner = this.ownership.route(id, phase, hit);
        if (before !== this.counters.cancellations) {
            // A duplicate-start cancellation may synchronously change modal/root/owner.
            this.cancel();
            return null;
        }
        if (!owner || this.suspended || this.cancelling) return null;
        const pointerWorld = phase === "start" ? world : this.pending.get(id)?.world ?? null;
        if (phase === "end" || phase === "cancel") this.pending.delete(id);
        else this.pending.set(id, { owner, event: cancellationSnapshot(event, id), world: pointerWorld });
        if (owner === "hud") {
            if (phase === "start") this.counters.hudStarts++;
        } else if (!this.blocked && pointerWorld && pointerWorld === this.world) {
            if (phase === "start") this.counters.worldStarts++;
            else if (phase === "move") this.counters.worldMoves++;
            else if (phase === "end") this.counters.worldEnds++;
            else this.counters.worldCancels++;
            pointerWorld.subscriber.touch(phase, event);
        }
        return owner;
    }

    routeWheel(event: EventMouse, hit: PointerOwner): PointerOwner | null {
        if (this.suspended || this.cancelling) return null;
        const world = this.currentWorld();
        if (hit === "world") {
            if (this.blocked) return null;
            if (world?.subscriber.wheel) {
                this.counters.worldWheels++;
                world.subscriber.wheel(event);
            }
        }
        return hit;
    }
    inspect() {
        return { active: this.adapterActive, blocked: this.blocked, suspended: this.suspended,
            ownersCount: this.ownership.count, pendingCount: this.pending.size, worldGeneration: this.world?.generation ?? null,
            counters: { ...this.counters }, worldState: this.world?.subscriber.inspect?.() ?? null };
    }
}

/** Framework composition singleton; gameplay consumes only the injected RawInputPort. */
export const rawInput = new RawInputRouter();
