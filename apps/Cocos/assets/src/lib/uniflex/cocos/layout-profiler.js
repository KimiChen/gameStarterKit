/** Opt-in instrumentation; no per-leaf timers. Rendering remains in the host. */
export class LayoutProfiler {
    constructor(now) {
        this.now = now;
        this.totals = {
            flushes: 0,
            flexMs: 0,
            writebackMs: 0,
            layoutCalls: 0,
            layoutNodes: 0,
            measuredLeaves: 0,
            percentageFallbacks: 0,
            textMeasureCalls: 0,
            textMeasureCacheHits: 0,
            writeVisits: 0,
            sizeWrites: 0,
            positionWrites: 0,
            labelLayouts: 0,
        };
    }
    layout(run) {
        const start = this.now();
        const result = run();
        this.totals.flexMs += this.now() - start;
        this.totals.layoutCalls++;
        this.totals.layoutNodes += result.stats.nodes;
        this.totals.measuredLeaves += result.stats.measuredLeaves;
        this.totals.percentageFallbacks += result.stats.percentageFallbacks;
        return result;
    }
    write(run) {
        const nestedFlexBefore = this.totals.flexMs;
        const start = this.now();
        run();
        // Scroll content and virtual items compute geometry during the host traversal.
        this.totals.writebackMs += Math.max(0, this.now() - start - (this.totals.flexMs - nestedFlexBefore));
    }
}
