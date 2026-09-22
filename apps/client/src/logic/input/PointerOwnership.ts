/** Engine-independent pointer ownership; a gesture keeps its starting target until end/cancel. */
export type PointerOwner = "hud" | "world";
export type PointerPhase = "start" | "move" | "end" | "cancel";

export class PointerOwnership {
    private readonly owners = new Map<number, PointerOwner>();
    private blocked = false;

    constructor(private readonly cancel: (id: number, owner: PointerOwner) => void) {}

    route(id: number, phase: PointerPhase, hit: PointerOwner): PointerOwner | null {
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
