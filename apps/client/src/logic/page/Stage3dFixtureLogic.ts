import type { PointerPhase } from "../input/PointerOwnership";

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

    pointer(id: number, phase: PointerPhase, x: number, y: number): void {
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
