import type { LayoutResult } from '../core/flex-types.js';
import type { LayoutWorkTotals } from '../core/provider.js';
/** Opt-in instrumentation; no per-leaf timers. Rendering remains in the host. */
export declare class LayoutProfiler {
    private readonly now;
    readonly totals: {
        -readonly [K in keyof LayoutWorkTotals]: LayoutWorkTotals[K];
    };
    constructor(now: () => number);
    layout<T extends LayoutResult>(run: () => T): T;
    write(run: () => void): void;
}
