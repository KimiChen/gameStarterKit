/** SC0 fixed-fixture pointer ownership. Experimental; replaced by SC1's owner-bound port. */
export type SpikePointerOwner = "hud" | "world";
export type SpikePointerPhase = "start" | "move" | "end" | "cancel";

export class SpikePointerOwnership {
    private readonly owners = new Map<number, SpikePointerOwner>();
    private blocked = false;

    constructor(private readonly cancel: (id: number, owner: SpikePointerOwner) => void) {}

    route(id: number, phase: SpikePointerPhase, hit: SpikePointerOwner): SpikePointerOwner | null {
        if (this.blocked) return null;
        if (phase === "start") {
            const previous = this.owners.get(id);
            this.owners.delete(id);
            if (previous) this.cancel(id, previous);
            // A cancellation can synchronously open a modal.
            if (this.blocked) return null;
            this.owners.set(id, hit);
            return hit;
        }
        const owner = this.owners.get(id) ?? null;
        if (phase === "end" || phase === "cancel") this.owners.delete(id);
        return owner;
    }

    setBlocked(blocked: boolean): void {
        if (this.blocked === blocked) return;
        this.blocked = blocked;
        if (blocked) this.cancelAll();
    }

    cancelAll(): void {
        const pending = [...this.owners];
        this.owners.clear();
        let failed = false;
        let firstError: unknown;
        for (const [id, owner] of pending) {
            try { this.cancel(id, owner); }
            catch (error) { if (!failed) { failed = true; firstError = error; } }
        }
        if (failed) throw firstError;
    }

    get count(): number { return this.owners.size; }
}

export class Stage3dFixtureLogic {
    starts = 0;
    moves = 0;
    ends = 0;
    cancels = 0;
    wheels = 0;
    hudClicks = 0;
    x = 0;
    y = 0;
    private readonly pointers = new Map<number, { x: number; y: number }>();

    pointer(id: number, phase: SpikePointerPhase, x: number, y: number): void {
        if (phase === "start") { this.starts++; this.pointers.set(id, { x, y }); return; }
        const previous = this.pointers.get(id);
        if (!previous) return;
        if (phase === "move") {
            this.moves++;
            this.x += x - previous.x;
            this.y += y - previous.y;
            this.pointers.set(id, { x, y });
        } else {
            if (phase === "cancel") this.cancels++; else this.ends++;
            this.pointers.delete(id);
        }
    }

    cancelAll(): void {
        this.cancels += this.pointers.size;
        this.pointers.clear();
    }

    get activePointers(): number { return this.pointers.size; }
}
